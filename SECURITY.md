# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Stored in `/data`**: `favorites.json`, the favorite stations with their
  last known details as published by the public Radio Browser directory
  (names, stream, website and logo addresses). No account, password, token or
  key exists: the directory is public and free.
- **Network**: HTTPS requests to the Radio Browser API servers (found by DNS),
  and downloads of the station logos from the stations' own websites. A logo
  address comes from a directory anyone can edit: before a download, its host
  must resolve to public addresses only (checked again on every redirect), the
  size is capped at 300 KB, and only the logos of the current favorites are
  ever fetched — so a station cannot make the container query the user's
  router or NAS. A host that changes its DNS answer between the check and the
  download (DNS rebinding) is not covered.
- **Logs**: never a full stream or logo address (they may carry a listener
  token): the server name only.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Radio Browser directory and the radio streams themselves.
