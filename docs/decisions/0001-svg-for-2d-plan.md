# 0001: SVG for the 2D plan view

- Status: accepted (2026-10-27)
- Context: the brief proposed react-konva (canvas). The plan of one house stays well under 1000 elements.
- Decision: render the 2D plan as SVG from the same scene graph as 3D.
- Consequences:
  - Vector PDF export at true scale (A3/A4) is nearly free (svg2pdf.js), with crisp hatches and text.
  - Playwright can target walls, rooms and labels as DOM elements instead of clicking by coordinates.
  - One dependency fewer. If a plan ever exceeds a few thousand elements, revisit (canvas layer for the grid/underlay).
