/project
├── server.js          ← Express app, routes, cache
├── parser.js          ← Pure workbook parser (no DOM, no state)
├── package.json
├── .env               ← ADMIN_PASSWORD, PORT
├── /uploads
│   └── latest.xlsx    ← Persistent disk (Render mount)
└── /public
    ├── index.html     ← Dashboard shell
    ├── app.js         ← Fetch + render + chart logic
    └── styles.css     ← Extracted CSS
