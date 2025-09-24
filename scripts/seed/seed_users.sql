-- Seed orgs and users for integration tests
INSERT INTO orgs (id, name)
VALUES ('89b197a9-98e4-424d-b350-bd48538d4365', 'PromptShield Test Org')
ON CONFLICT (id) DO NOTHING;

-- Ensure deterministic user identities for tests
INSERT INTO users (id, org_id, email, display_name, role)
VALUES
  ('3a9f3c8d-339e-4d0d-8ce6-281b665fb692', '89b197a9-98e4-424d-b350-bd48538d4365', 'alice@acme.com', 'Alice', 'admin'),
  ('7a97400a-ca0c-4948-b6af-5c7cd2dfbc94', '89b197a9-98e4-424d-b350-bd48538d4365', 'bob@acme.com', 'Bob', 'analyst'),
  ('1b5cefb7-06f0-4cf1-b059-2bb0fb2c993b', '89b197a9-98e4-424d-b350-bd48538d4365', 'carol@acme.com', 'Carol', 'member')
ON CONFLICT (id) DO NOTHING;
