require('./config');
const express = require('express');
const path = require('node:path');
const { openDb } = require('./db');
const { validateFeedback } = require('./validate');

function createApp(db) {
  const app = express();
  app.use(express.json());
  // Frontendi failid asuvad kaustas ../frontend
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  // Õppeainete nimekiri vormi jaoks
  app.get('/api/subjects', async (req, res, next) => {
    try {
      res.json(await db.listSubjects());
    } catch (err) {
      next(err);
    }
  });

  // Õpilane saadab tagasiside
  app.post('/api/feedback', async (req, res, next) => {
    try {
      const { valid, errors, data } = await validateFeedback(req.body || {}, (id) => db.subjectExists(id));
      if (!valid) return res.status(400).json({ errors });
      const id = await db.addFeedback(data);
      res.status(201).json({ id, message: 'Tagasiside on salvestatud.' });
    } catch (err) {
      next(err);
    }
  });

  // Õpetaja vaade: kõik tagasisided (valikuliselt ühe aine kaupa)
  app.get('/api/feedback', async (req, res, next) => {
    try {
      res.json(await db.listFeedback(req.query.subjectId || null));
    } catch (err) {
      next(err);
    }
  });

  // Õpetaja vaade: ainete kokkuvõte (vastuste arv ja keskmine hinne)
  app.get('/api/stats', async (req, res, next) => {
    try {
      res.json(await db.stats());
    } catch (err) {
      next(err);
    }
  });

  // Vigane JSON vms
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ errors: { form: 'Vigased andmed.' } });
    console.error(err);
    res.status(500).json({ errors: { form: 'Serveri viga. Proovi hiljem uuesti.' } });
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  openDb()
    .then((db) => {
      const server = createApp(db).listen(port, () => {
        console.log(`Tagasiside rakendus töötab: http://localhost:${port}`);
        console.log(`Õpetaja ülevaade:          http://localhost:${port}/ylevaade.html`);
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${port} on juba kasutusel. Pane .env faili teine port, nt PORT=3001.`);
        } else {
          console.error(err);
        }
        process.exit(1);
      });
    })
    .catch((err) => {
      console.error('Andmebaasiga ühendamine ebaõnnestus:', err.message);
      console.error('Kontrolli MONGODB_URI väärtust .env failis ja et MongoDB server on kättesaadav.');
      process.exit(1);
    });
}

module.exports = { createApp };
