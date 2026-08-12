const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');

app = app.replace(/<GlobalSearch seed=\{seed\} \/>\n/g, '');

fs.writeFileSync('src/App.tsx', app, 'utf8');
