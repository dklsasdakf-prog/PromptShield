from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any, Iterable

from opensearchpy import OpenSearch, RequestsHttpConnection
from opensearchpy.exceptions import TransportError

from functools import lru_cache

from ..settings import settings

INDEX_TEMPLATE = {
    "index_patterns": ["events-*-v1"],
    "template": {
        "mappings": {
            "dynamic": "false",
            "properties": {
                "event_id": {"type": "keyword"},
                "ts": {"type": "date"},
                "received_at": {"type": "date"},
                "org_id": {"type": "keyword"},
                "identity": {"type": "keyword"},
                "app": {"type": "keyword"},
                "domain": {"type": "keyword"},
                "session_id": {"type": "keyword"},
                "action": {"type": "keyword"},
                "outcome": {"type": "keyword"},
                "risk": {"type": "integer"},
                "idem": {"type": "keyword"},
                "policy_hits": {"type": "keyword"},
                "counters": {
                    "properties": {
                        "prompts_inspected": {"type": "long"},
                        "prompts_violated": {"type": "long"},
                        "prompts_redacted": {"type": "long"},
                    }
                },
                "details": {"type": "object", "enabled": True},
            },
        }
    },
}

ILM_POLICY = {
    "policy": {
        "phases": {
            "hot": {"min_age": "0ms", "actions": {"rollover": {"max_size": "50gb", "max_age": "7d"}}},
            "warm": {"min_age": "30d", "actions": {"forcemerge": {"max_num_segments": 1}}},
            "delete": {"min_age": "180d", "actions": {"delete": {}}},
        }
    }
}


class OpenSearchService:
    TEMPLATE_NAME = "events-template-v1"
    ILM_POLICY_NAME = "events-ilm-policy"

    def __init__(self) -> None:
        self.client = OpenSearch(
            hosts=[settings.opensearch_node],
            http_auth=(settings.opensearch_username, settings.opensearch_password),
            http_compress=True,
            use_ssl=settings.opensearch_node.startswith("https"),
            verify_certs=False,
            connection_class=RequestsHttpConnection,
        )
        self.ensure_templates()

    def ensure_templates(self, *, force: bool = False) -> None:
        """Install the ILM policy and index template if missing."""
        ilm_enabled = self._install_ilm_policy(force=force)
        template_exists = self.client.indices.exists_index_template(name=self.TEMPLATE_NAME)
        if force or not template_exists:
            body = copy.deepcopy(INDEX_TEMPLATE)
            body["priority"] = 500
            body["_meta"] = {"managed_by": "checkred"}
            if ilm_enabled:
                settings_block = body.setdefault("template", {}).setdefault("settings", {})
                settings_block["index.lifecycle.name"] = self.ILM_POLICY_NAME
            self.client.indices.put_index_template(name=self.TEMPLATE_NAME, body=body)

    def _install_ilm_policy(self, *, force: bool = False) -> bool:
        if not hasattr(self.client, "ilm"):
            return False
        try:
            if force or not self.client.ilm.policy_exists(self.ILM_POLICY_NAME):
                self.client.ilm.put_lifecycle(self.ILM_POLICY_NAME, ILM_POLICY)
            return True
        except Exception:  # pragma: no cover - ILM not available in dev containers
            return False

    def _index_name(self, org_id: str) -> str:
        return f"events-{org_id}-v1"

    def ensure_index(self, org_id: str) -> str:
        index = self._index_name(org_id)
        if not self.client.indices.exists(index=index):
            body = {
                "settings": {
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                }
            }
            try:
                self.client.indices.create(index=index, body=body)
            except TransportError as exc:
                if exc.error != "resource_already_exists_exception":  # pragma: no cover - race condition
                    raise
        return index

    def bootstrap_org(self, org_id: str, *, force_template: bool = False) -> str:
        if force_template:
            self.ensure_templates(force=True)
        else:
            self.ensure_templates()
        return self.ensure_index(org_id)

    def ingest(self, org_id: str, events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        index = self.ensure_index(org_id)
        body: list[dict[str, Any]] = []
        count = 0
        received_at = datetime.now(tz=timezone.utc).isoformat()
        for event in events:
            doc = event.copy()
            doc.setdefault("org_id", org_id)
            doc.setdefault("received_at", received_at)
            body.append({"index": {"_index": index}})
            body.append(doc)
            count += 1
        if not body:
            return []
        response = self.client.bulk(body=body, refresh=False)
        items = response.get("items", [])
        # Ensure result length matches number of docs; OpenSearch returns one item per doc
        if len(items) != count:
            # In rare mixed responses, take every dict with "index" key
            items = [item for item in items if "index" in item]
        return items

    def search(self, org_id: str, body: dict[str, Any]) -> dict[str, Any]:
        index = self._index_name(org_id)
        return self.client.search(index=index, body=body)

    def unique_identities(
        self,
        org_id: str,
        days: int | None = None,
        apps: list[str] | None = None,
    ) -> int:
        index = self._index_name(org_id)
        filters: list[dict[str, Any]] = [{"term": {"org_id": org_id}}]
        if days:
            filters.append({"range": {"ts": {"gte": f"now-{days}d"}}})
        if apps:
            filters.append({"terms": {"app": apps}})

        body = {
            "size": 0,
            "query": {"bool": {"filter": filters}},
            "aggs": {"uniq": {"cardinality": {"field": "identity"}}},
        }
        try:
            response = self.client.search(index=index, body=body)
            return int(response.get("aggregations", {}).get("uniq", {}).get("value", 0))
        except Exception:
            return 0

    def existing_event_ids_by_idem(self, org_id: str, idem: str) -> set[str]:
        index = self.ensure_index(org_id)
        body = {
            "size": 1000,
            "query": {
                "bool": {
                    "filter": [
                        {"term": {"org_id": org_id}},
                        {"term": {"idem": idem}},
                    ]
                }
            },
            "_source": ["event_id"],
        }
        try:
            response = self.client.search(index=index, body=body)
        except Exception:  # pragma: no cover - network errors handled upstream
            return set()
        hits = response.get("hits", {}).get("hits", [])
        return {hit.get("_source", {}).get("event_id") for hit in hits if hit.get("_source")}

@lru_cache(maxsize=1)
def get_opensearch_service() -> "OpenSearchService":
    return OpenSearchService()
