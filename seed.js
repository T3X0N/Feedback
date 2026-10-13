require('./config');
// Lisab andmebaasi näidistagasisided (demo jaoks).
//   npm run seed          lisab näidisandmed olemasolevatele juurde
//   npm run seed -- --reset   kustutab enne kõik tagasisided
const { openDb } = require('./db');

const SAMPLES = [
  ['Mari Maasikas', '10A', 'Matemaatika', 5, 'Väga hästi seletatud!'],
  ['Jaan Tamm', '10B', 'Matemaatika', 4, null],
  [null, '10B', 'Matemaatika', 3, 'Tempo on liiga kiire'],
  ['Kati Karu', '10A', 'Matemaatika', 4, 'Kodutöid võiks vähem olla'],
  ['Liis Kask', '11A', 'Vene keel', 5, 'Tore õpetaja'],
  [null, '11B', 'Vene keel', 4, null],
  [null, '11A', 'Andmebaasid', 3, 'Liiga palju kodutöid'],
  ['Anna Lepp', '10A', 'Andmebaasid', 4, null],
  ['Rasmus Raud', '12A', 'Andmebaasid', 5, 'MongoDB oli huvitav'],
  ['Eva Ilves', '12A', 'Programmeerimine', 5, 'Parim aine!'],
  ['Oliver Org', '12B', 'Programmeerimine', 4, null],
  ['Laura Laas', '10B', 'Eesti keel', 3, 'Kirjandeid oli palju'],
  ['Markus Saar', '11B', 'Füüsika', 2, 'Raske oli kaasas käia'],
];

(async () => {
  const db = await openDb();
  if (process.argv.includes('--reset')) {
    await db.clearFeedback();
    console.log('Vanad tagasisided kustutatud.');
  }
  const subjects = new Map((await db.listSubjects()).map((s) => [s.name, s.id]));
  for (const [studentName, className, subject, grade, comment] of SAMPLES) {
    await db.addFeedback({ studentName, anonymous: !studentName, className, subjectId: subjects.get(subject), grade, comment });
  }
  console.log(`Lisatud ${SAMPLES.length} näidistagasisidet. Õppeaineid andmebaasis: ${subjects.size}.`);
  await db.close();
})().catch((err) => {
  console.error('Seed ebaõnnestus:', err.message);
  process.exit(1);
});
