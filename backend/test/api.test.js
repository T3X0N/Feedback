require('../config');
// Käivita: npm test
// Testid kasutavad eraldi andmebaasi "tagasiside_test", mis kustutatakse pärast teste.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../db');

// Testi jaoks oma õppeainete fail koos õpetajaga
const subjectsFile = path.join(os.tmpdir(), `subjects-test-${process.pid}.json`);
fs.writeFileSync(subjectsFile, JSON.stringify([{ name: 'Matemaatika', teacher: 'Mari Tamm' }, { name: 'Vene keel', teacher: '' }]));
process.env.SUBJECTS_FILE = subjectsFile;
const { createApp } = require('../server');

let server, base, db;

before(async () => {
  db = await openDb(process.env.MONGODB_URI, 'tagasiside_test');
  await db.dropDatabase();
  await db.close();
  db = await openDb(process.env.MONGODB_URI, 'tagasiside_test');
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await db.dropDatabase();
  await db.close();
  fs.rmSync(subjectsFile, { force: true });
});

const post = (body) =>
  fetch(base + '/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('tühja vormi korral tulevad veateated kõigile kohustuslikele väljadele', async () => {
  const res = await post({});
  assert.strictEqual(res.status, 400);
  const { errors } = await res.json();
  assert.deepStrictEqual(Object.keys(errors).sort(), ['className', 'grade', 'studentName', 'subjectId']);
});

test('hinne peab olema 1-5', async () => {
  const [s] = await (await fetch(base + '/api/subjects')).json();
  const res = await post({ studentName: 'Mari', className: '10A', subjectId: s.id, grade: 7 });
  assert.strictEqual(res.status, 400);
  assert.ok((await res.json()).errors.grade);
});

test('olematu õppeaine lükatakse tagasi', async () => {
  for (const subjectId of ['9999', '000000000000000000000000']) {
    const res = await post({ studentName: 'Mari', className: '10A', subjectId, grade: 4 });
    assert.strictEqual(res.status, 400);
    assert.ok((await res.json()).errors.subjectId);
  }
});

test('korrektne tagasiside salvestub ja ilmub ülevaatesse koos keskmisega', async () => {
  const subjects = await (await fetch(base + '/api/subjects')).json();
  const math = subjects.find((s) => s.name === 'Matemaatika');
  const vene = subjects.find((s) => s.name === 'Vene keel');
  assert.strictEqual((await post({ studentName: 'Mari Maasikas', className: '10A', subjectId: math.id, grade: 5, comment: 'Super' })).status, 201);
  assert.strictEqual((await post({ studentName: 'Jaan Tamm', className: '10B', subjectId: math.id, grade: 4 })).status, 201);
  assert.strictEqual((await post({ studentName: 'Liis Kask', className: '11A', subjectId: vene.id, grade: 5 })).status, 201);

  const list = await (await fetch(base + '/api/feedback')).json();
  assert.strictEqual(list.length, 3);
  assert.ok(list[0].createdAt);

  const stats = await (await fetch(base + '/api/stats')).json();
  assert.deepStrictEqual(stats.map(({ subject, responses, average }) => ({ subject, responses, average })), [
    { subject: 'Matemaatika', responses: 2, average: 4.5 },
    { subject: 'Vene keel', responses: 1, average: 5 },
  ]);

  const filtered = await (await fetch(base + '/api/feedback?subjectId=' + math.id)).json();
  assert.strictEqual(filtered.length, 2);
});

test('andmebaasi skeem keelab vigase hinde ka otse andmebaasi kirjutades', async () => {
  const [s] = await (await fetch(base + '/api/subjects')).json();
  await assert.rejects(
    db.addFeedback({ studentName: 'Mari', className: '10A', subjectId: s.id, grade: 9, comment: '' }),
    /Document failed validation/
  );
});

test('õpetaja nimi tuleb subjects.json failist ja uueneb taaskäivitusel', async () => {
  let subjects = await (await fetch(base + '/api/subjects')).json();
  assert.strictEqual(subjects.find((s) => s.name === 'Matemaatika').teacher, 'Mari Tamm');
  assert.strictEqual(subjects.find((s) => s.name === 'Vene keel').teacher, null);

  fs.writeFileSync(subjectsFile, JSON.stringify([{ name: 'Matemaatika', teacher: 'Jüri Kask' }, { name: 'Vene keel', teacher: 'Olga Ivanova' }]));
  const db2 = await openDb(process.env.MONGODB_URI, 'tagasiside_test');
  subjects = await db2.listSubjects();
  await db2.close();
  assert.strictEqual(subjects.find((s) => s.name === 'Matemaatika').teacher, 'Jüri Kask');
  assert.strictEqual(subjects.find((s) => s.name === 'Vene keel').teacher, 'Olga Ivanova');

  const stats = await (await fetch(base + '/api/stats')).json();
  assert.strictEqual(stats.find((s) => s.subject === 'Matemaatika').teacher, 'Jüri Kask');
});

test('anonüümne tagasiside ei vaja nime ega salvesta seda', async () => {
  const subjects = await (await fetch(base + '/api/subjects')).json();
  const math = subjects.find((s) => s.name === 'Matemaatika');
  const res = await post({ anonymous: true, studentName: 'Salajane Sass', className: '10A', subjectId: math.id, grade: 3 });
  assert.strictEqual(res.status, 201);
  const { id } = await res.json();
  const row = (await (await fetch(base + '/api/feedback')).json()).find((r) => r.id === id);
  assert.strictEqual(row.anonymous, true);
  assert.strictEqual(row.studentName, null);

  const noName = await post({ className: '10A', subjectId: math.id, grade: 3 });
  assert.strictEqual(noName.status, 400);
  assert.match((await noName.json()).errors.studentName, /anonüümselt/);
});
