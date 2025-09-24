#!/usr/bin/env python3
"""Generate a test JWT token for development."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend/api'))
from backend.api.utils.jwt_tokens import mint_test_token

# Generate a test token that expires in 24 hours
token = mint_test_token(
    org_id="test-org",
    user_id="test-user",
    scopes=["admin"],
    expires_in=24*3600  # 24 hours
)

print(f"Generated JWT token: {token}")

# Update the .env.local file
env_file = "apps/admin/.env.local"
lines = []
if os.path.exists(env_file):
    with open(env_file, 'r') as f:
        lines = f.readlines()

# Update or add the token line
updated = False
for i, line in enumerate(lines):
    if line.startswith('VITE_API_TOKEN='):
        lines[i] = f'VITE_API_TOKEN={token}\n'
        updated = True
        break

if not updated:
    lines.append(f'VITE_API_TOKEN={token}\n')

with open(env_file, 'w') as f:
    f.writelines(lines)

print(f"Updated {env_file} with the new token")