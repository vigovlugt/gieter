# Agents

Description: this is a project with the goal for me and 7 other friends to find a nice place to stay in france for a week in the summer. We are 8 students, and we would like to go to a place where we can chill.
The project scrapes a lot of listings from a gites-de-france.com. The plan is to analyze them using AI and find the best place to stay.

## HTTP requests

Use `fcurl` instead of plain `curl` when fetching URLs. `fcurl` sends a Firefox User-Agent header which is required to bypass Cloudflare protection on gites-de-france.com. It returns the raw server HTML (no JavaScript execution), which is what we want — the full untruncated content.

```bash
./scripts/fcurl <url>
```

Only fall back to `cfcurl` (FlareSolverr/headless Chrome) if `fcurl` fails, since `cfcurl` executes JavaScript which causes the site to truncate description text before returning the HTML.

```bash
./scripts/cfcurl <url>
```
