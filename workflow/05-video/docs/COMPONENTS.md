# Motion Engine — Component Catalog

This document is auto-generated from the active `COMPONENT_REGISTRY` in `src/lib/registry.ts`.
Every component reads strictly from design tokens and motion constants.

---

| Component | Purpose | Status |
| :--- | :--- | :--- |
| `BigNumber` | Hero large number count-up animation landing on spoken word anchor | **Active** |
| `BarCompare` | Comparative staggered bar chart with numbers and highlight coloring | **Active** |
| `LineDraw` | Animated line path chart with gradient area and peak annotation | **Active** |
| `SizeCompare` | Visceral area-proportional geometric shapes for scale differences | **Active** |
| `IconGrid` | 100-icon grid (10x10) displaying wealth/population concentration | **Active** |
| `MoneyFlow` | Nodes and animated moving particle flows across financial institutions | **Active** |
| `TitleCard` | Dramatic video/scene title card with optional chapter badge | **Active** |
| `TermCard` | Financial term definition card with rough-notation keyword underline | **Active** |
| `SourceTag` | Institutional source citation tag for data credibility | **Active** |

---

## Component Details & Fixtures

### `BigNumber`

**Description:** Hero large number count-up animation landing on spoken word anchor

#### Example Fixture Props:
```json
{
  "id": "fx-daily-volume",
  "name": "FX Daily Volume",
  "props": {
    "value": 9.6,
    "prefix": "$",
    "suffix": "TRILLION",
    "decimals": 1,
    "label": "Traded across currency markets every single day",
    "sublabel": "Source: BIS Triennial Central Bank Survey 2025",
    "accentColor": "#F5B83D"
  }
}
```

### `BarCompare`

**Description:** Comparative staggered bar chart with numbers and highlight coloring

#### Example Fixture Props:
```json
{
  "id": "fx-vs-equities",
  "name": "FX vs Stock Markets",
  "props": {
    "title": "Daily Global Trading Volume",
    "subtitle": "Comparing average daily turnover (USD Trillions)",
    "unitPrefix": "$",
    "unitSuffix": "T / day",
    "items": [
      {
        "label": "Foreign Exchange Market",
        "value": 9.6,
        "color": "#F5B83D",
        "highlight": true
      },
      {
        "label": "Global Equities (All Exchanges)",
        "value": 0.95,
        "color": "#2EC4B6",
        "highlight": false
      },
      {
        "label": "Global Crypto Spot & Derivs",
        "value": 0.12,
        "color": "#8A97A6",
        "highlight": false
      }
    ]
  }
}
```

### `LineDraw`

**Description:** Animated line path chart with gradient area and peak annotation

#### Example Fixture Props:
```json
{
  "id": "fx-growth-decade",
  "name": "Global FX Turnover Growth",
  "props": {
    "title": "Daily Global FX Trading Growth",
    "subtitle": "Average daily turnover recorded every 3 years (USD Trillions)",
    "unitPrefix": "$",
    "unitSuffix": "T",
    "color": "#F5B83D",
    "peakCallout": "Peak: $9.6T",
    "data": [
      {
        "x": "2010",
        "y": 4
      },
      {
        "x": "2013",
        "y": 5.3
      },
      {
        "x": "2016",
        "y": 5.1
      },
      {
        "x": "2019",
        "y": 6.6
      },
      {
        "x": "2022",
        "y": 7.5
      },
      {
        "x": "2025",
        "y": 9.6
      }
    ]
  }
}
```

### `SizeCompare`

**Description:** Visceral area-proportional geometric shapes for scale differences

#### Example Fixture Props:
```json
{
  "id": "fx-vs-equities-circles",
  "name": "FX vs Equities Proportional Spheres",
  "props": {
    "title": "Scale Comparison: Daily Trading Volume",
    "subtitle": "Area corresponds directly to dollar turnover",
    "items": [
      {
        "label": "Foreign Exchange Market",
        "value": 9.6,
        "displayValue": "$9.6T",
        "color": "#F5B83D",
        "subtext": "10× larger daily volume"
      },
      {
        "label": "Global Stock Market",
        "value": 0.95,
        "displayValue": "$0.95T",
        "color": "#2EC4B6",
        "subtext": "All global bourses"
      }
    ]
  }
}
```

### `IconGrid`

**Description:** 100-icon grid (10x10) displaying wealth/population concentration

#### Example Fixture Props:
```json
{
  "id": "one-percent-wealth",
  "name": "The Top 1% Wealth Concentration",
  "props": {
    "title": "Who Controls the Wealth?",
    "subtitle": "Representing 100% of the world's population",
    "totalCount": 100,
    "highlightCount": 1,
    "highlightLabel": "Top 1% Wealth Holders",
    "remainingLabel": "Remaining 99% of Humanity",
    "highlightColor": "#F5B83D"
  }
}
```

### `MoneyFlow`

**Description:** Nodes and animated moving particle flows across financial institutions

#### Example Fixture Props:
```json
{
  "id": "fx-interbank-clearing",
  "name": "Interbank FX Settlement",
  "props": {
    "title": "Cross-Border Liquidity Transfer",
    "subtitle": "How trillions settle across commercial banking corridors in seconds",
    "flowColor": "#F5B83D",
    "nodes": [
      {
        "id": "ny-bank",
        "label": "New York Commercial",
        "subtext": "Fedwire Settlement",
        "color": "#2EC4B6"
      },
      {
        "id": "cls-bank",
        "label": "CLS Clearing Hub",
        "subtext": "Continuous Linked Settlement",
        "color": "#F5B83D"
      },
      {
        "id": "london-bank",
        "label": "London Dealer Hub",
        "subtext": "CHAPS Settlement",
        "color": "#2EC4B6"
      }
    ],
    "transfers": [
      {
        "fromId": "ny-bank",
        "toId": "cls-bank",
        "amountLabel": "$4.2 Trillion"
      },
      {
        "fromId": "cls-bank",
        "toId": "london-bank",
        "amountLabel": "£3.1 Trillion"
      }
    ]
  }
}
```

### `TitleCard`

**Description:** Dramatic video/scene title card with optional chapter badge

#### Example Fixture Props:
```json
{
  "id": "fx-opener",
  "name": "FX Market Opener Card",
  "props": {
    "chapterBadge": "PROLOGUE",
    "title": "The Invisible River of Global Liquidity",
    "subtitle": "How money itself is bought and sold across global corridors",
    "accentColor": "#F5B83D"
  }
}
```

### `TermCard`

**Description:** Financial term definition card with rough-notation keyword underline

#### Example Fixture Props:
```json
{
  "id": "term-fx-swap",
  "name": "Foreign Exchange Swap",
  "props": {
    "category": "MARKET MECHANISM",
    "term": "FX Swap Agreement",
    "definition": "A contract where two institutional parties simultaneously borrow and lend identical amounts in different currencies, creating massive synthetic dollar liquidity.",
    "highlightWord": "synthetic dollar liquidity",
    "accentColor": "#F5B83D"
  }
}
```

### `SourceTag`

**Description:** Institutional source citation tag for data credibility

#### Example Fixture Props:
```json
{
  "id": "bis-survey",
  "name": "BIS Triennial Survey",
  "props": {
    "text": "Bank for International Settlements (BIS) Triennial Central Bank Survey 2025"
  }
}
```

