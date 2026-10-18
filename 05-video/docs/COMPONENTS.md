# Motion Engine — Component Catalog

This catalog documents the reusable visual components registered in the Motion Engine library (`src/components/`).

| Component | Group | Purpose | Primary Props |
| :--- | :--- | :--- | :--- |
| `BigNumber` | Numbers | Large animated stat count-up | `value`, `prefix`, `suffix`, `label`, `decimals`, `anchors` |
| `StatCompare` | Numbers | Side-by-side metric comparison | `left: { label, value }`, `right: { label, value }` |
| `Delta` | Numbers | Metric with positive/negative growth arrow | `value`, `delta`, `percent`, `label` |
| `BarCompare` | Charts | Animated horizontal/vertical comparative bars | `items: [{ label, value, color }]` |
| `LineDraw` | Charts | Animated line chart with peak/trough callout | `data: [{ x, y }]`, `peakLabel` |
| `SizeCompare` | Proportion | Visceral comparative proportional circles/boxes | `items: [{ label, value, color }]` |
| `IconGrid` / `Waffle` | Proportion | 100-icon grid showing wealth distribution (1% vs 99%) | `total`, `highlightCount`, `icon` |
| `MoneyFlow` | Flow | Animated particle flow between balance sheets / entities | `fromNode`, `toNode`, `amountLabel` |
| `WorldMapArcs` | Geo | Bundled TopoJSON world map with arc transfers | `hubs: string[]` |
| `TitleCard` | Text | Bold scene / hook opener card | `title`, `subtitle` |
| `TermCard` | Text | Financial definition or term callout | `term`, `definition`, `highlightWord` |
| `SourceTag` | Structure | Subtle citation tag for data credibility | `text`, `year` |
| `CaptionBar` | Captions | Bottom clean subtitle bar with active word highlight | `captions: Caption[]`, `style` |

All components are previewable in Remotion Studio via the `Gallery` composition.
