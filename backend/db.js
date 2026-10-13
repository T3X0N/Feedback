// Andmebaasi kiht: MongoDB
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient, ObjectId } = require('mongodb');

// Õppeained ja õpetajad tulevad failist subjects.json. Muuda seda faili ja taaskäivita server.
function loadSubjects(file = process.env.SUBJECTS_FILE || path.join(__dirname, 'subjects.json')) {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Faili subjects.json ei saanud lugeda: ${err.message}`);
  }
  if (!Array.isArray(list)) throw new Error('subjects.json peab olema massiiv: [{ "name": "...", "teacher": "..." }]');
  return list
    .map((s) => (typeof s === 'string' ? { name: s, teacher: '' } : s))
    .filter((s) => s && String(s.name || '').trim())
    .map((s) => ({ name: String(s.name).trim(), teacher: String(s.teacher || '').trim() || null }));
}

function toObjectId(id) {
  return ObjectId.isValid(String(id)) && String(new ObjectId(String(id))) === String(id) ? new ObjectId(String(id)) : null;
}

// Andmebaasi skeem: MongoDB ise keelab valed andmed ka siis, kui keegi kirjutab otse andmebaasi
const VALIDATORS = {
  subjects: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name'],
      properties: {
        name: { bsonType: 'string', minLength: 1, description: 'õppeaine nimi' },
        teacher: { bsonType: ['string', 'null'], description: 'õpetaja nimi' },
      },
    },
  },
  feedback: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['className', 'subjectId', 'grade', 'createdAt'],
      properties: {
        studentName: { bsonType: ['string', 'null'], minLength: 2, maxLength: 100, description: 'õpilase nimi (null kui anonüümne)' },
        anonymous: { bsonType: 'bool', description: 'kas tagasiside on anonüümne' },
        className: { bsonType: 'string', minLength: 1, maxLength: 20, description: 'klass' },
        subjectId: { bsonType: 'objectId', description: 'viide subjects._id' },
        grade: { bsonType: 'int', minimum: 1, maximum: 5, description: 'hinne 1-5' },
        comment: { bsonType: ['string', 'null'], maxLength: 1000, description: 'valikuline kommentaar' },
        createdAt: { bsonType: 'date', description: 'saatmise aeg' },
      },
    },
  },
};

// Loob kollektsioonid koos valideerimisreeglitega (või uuendab reegleid, kui kollektsioon on juba olemas)
async function ensureCollections(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, validator] of Object.entries(VALIDATORS)) {
    if (existing.has(name)) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    }
  }
}

async function openDb(uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB || 'tagasiside') {
  if (!uri) throw new Error('MONGODB_URI puudub: faili .env ei leitud kaustas ' + __dirname + '. Kopeeri .env.example nimega .env ja pane sinna andmebaasi aadress.');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  const subjects = db.collection('subjects');
  const feedback = db.collection('feedback');

  await ensureCollections(db);
  await subjects.createIndex({ name: 1 }, { unique: true });
  await feedback.createIndex({ subjectId: 1, createdAt: -1 });
  // Lisa uued õppeained ja uuenda õpetajate nimed subjects.json järgi
  const subjectList = loadSubjects();
  if (subjectList.length) {
    await subjects.bulkWrite(
      subjectList.map(({ name, teacher }) => ({
        updateOne: { filter: { name }, update: { $set: { name, teacher } }, upsert: true },
      }))
    );
  }

  return {
    async listSubjects() {
      const rows = await subjects.find().sort({ name: 1 }).toArray();
      return rows.map((s) => ({ id: String(s._id), name: s.name, teacher: s.teacher || null }));
    },
    async subjectExists(id) {
      const _id = toObjectId(id);
      return !!_id && !!(await subjects.findOne({ _id }));
    },
    async addFeedback({ studentName, anonymous = false, className, subjectId, grade, comment }) {
      const res = await feedback.insertOne({
        studentName: anonymous ? null : studentName,
        anonymous: !!anonymous,
        className,
        subjectId: toObjectId(subjectId),
        grade,
        comment: comment || null,
        createdAt: new Date(),
      });
      return String(res.insertedId);
    },
    async listFeedback(subjectId) {
      const match = subjectId ? { subjectId: toObjectId(subjectId) } : {};
      const rows = await feedback
        .aggregate([
          { $match: match },
          { $sort: { createdAt: -1 } },
          { $lookup: { from: 'subjects', localField: 'subjectId', foreignField: '_id', as: 'subject' } },
          { $unwind: '$subject' },
        ])
        .toArray();
      return rows.map((r) => ({
        id: String(r._id),
        subject: r.subject.name,
        teacher: r.subject.teacher || null,
        studentName: r.studentName || null,
        anonymous: !!r.anonymous || !r.studentName,
        className: r.className,
        grade: r.grade,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      }));
    },
    async stats() {
      const rows = await feedback
        .aggregate([
          { $group: { _id: '$subjectId', responses: { $sum: 1 }, average: { $avg: '$grade' } } },
          { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subject' } },
          { $unwind: '$subject' },
          { $sort: { 'subject.name': 1 } },
        ])
        .toArray();
      return rows.map((r) => ({
        id: String(r._id),
        subject: r.subject.name,
        teacher: r.subject.teacher || null,
        responses: r.responses,
        average: Math.round(r.average * 10) / 10,
      }));
    },
    async clearFeedback() {
      await feedback.deleteMany({});
    },
    async dropDatabase() {
      await db.dropDatabase();
    },
    async close() {
      await client.close();
    },
  };
}

module.exports = { openDb };
