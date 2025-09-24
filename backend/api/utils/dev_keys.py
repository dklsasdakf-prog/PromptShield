"""Developer convenience Ed25519 keys.

These keys are for local development only. Override them in production by
setting CONFIG_SIGN_PUBKEY / CONFIG_SIGN_PRIVKEY.
"""

DEV_PRIVATE_KEY_B64 = "e8ie4kDB0O7ipof+yZ37OgEJYs4yG3sbbAjb3pJP840="
DEV_PUBLIC_KEY_B64 = "LwwO8DLAx/lxbzFZVkFykbDMOtIgOYFN2YmIE9GXaC0="

# Ed25519 pair derived from RFC 8032 test vectors; safe for local development only.
DEV_JWT_PRIVATE_KEY_B64 = "nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A="
DEV_JWT_PUBLIC_KEY_B64 = "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="
