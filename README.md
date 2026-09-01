# Bultex Electronics Isiolo Technical Department System

This project is a simple record and receipt system for the technical department at Bultex Electronics Isiolo.

## Features
- Daily work activity logging for technicians
- Repair and issue tracking with spare part details
- Supplier phone number, source, and cost recording
- Client payment tracking with generated e-receipt preview
- Local browser storage so records remain on the machine used

## How to run
1. Open a terminal in the project folder.
2. Run:
   `python3 -m http.server 8000`
3. Open your browser and visit:
   `http://localhost:8000`

## Files
- [index.html](index.html) — main interface
- [style.css](style.css) — styling
- [app.js](app.js) — form logic and receipt generation

## Notes
This version is designed as a lightweight desktop-friendly system and stores data in the browser using local storage.
