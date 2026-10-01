---
title: Titre court de l'incident ou de la maintenance
status: investigating        # investigating | identified | monitoring | resolved
severity: degraded           # degraded | partial_outage | major_outage | maintenance
components: [upload]         # ids de composants (voir src/lib/components.ts), ou: all
startedAt: 2026-01-01T10:00:00Z
resolvedAt:                  # à remplir quand status = resolved
endsAt:                      # fin prévue, pour une maintenance
summary: Une phrase qui résume la situation.
---
## 2026-01-01T10:00:00Z — investigating
Premier message : ce qu'on sait, ce qu'on fait. Le Markdown simple est accepté (**gras**, listes, liens).

## 2026-01-01T10:40:00Z — resolved
Message de fin : la cause et le retour à la normale.
