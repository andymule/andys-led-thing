const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`LED Grid running at http://localhost:${PORT}`);
});
