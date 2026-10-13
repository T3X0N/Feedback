// Vormi valideerimine serveris. Sama loogika on ka brauseris (frontend/app.js),
// aga server kontrollib alati uuesti, sest brauseri kontrolli saab mööda minna.
async function validateFeedback(body, subjectExists) {
  const errors = {};
  const anonymous = body.anonymous === true || body.anonymous === 'true' || body.anonymous === 'on';
  const studentName = anonymous ? '' : String(body.studentName ?? '').trim();
  const className = String(body.className ?? '').trim();
  const comment = String(body.comment ?? '').trim();
  const subjectId = String(body.subjectId ?? '').trim();
  const grade = Number(body.grade);

  if (anonymous) {
    // nime pole vaja
  } else if (!studentName) errors.studentName = 'Palun sisesta oma nimi või vali "Saada anonüümselt".';
  else if (studentName.length < 2) errors.studentName = 'Nimi peab olema vähemalt 2 tähemärki.';
  else if (studentName.length > 100) errors.studentName = 'Nimi võib olla kuni 100 tähemärki.';

  if (!className) errors.className = 'Palun sisesta oma klass (nt 10A või TAK-24).';
  else if (className.length > 20) errors.className = 'Klass võib olla kuni 20 tähemärki.';

  if (!subjectId) errors.subjectId = 'Palun vali õppeaine.';
  else if (!(await subjectExists(subjectId))) errors.subjectId = 'Valitud õppeainet ei leitud. Vali aine nimekirjast.';

  if (body.grade === undefined || body.grade === null || body.grade === '')
    errors.grade = 'Palun anna õppeainele hinne 1 kuni 5.';
  else if (!Number.isInteger(grade) || grade < 1 || grade > 5)
    errors.grade = 'Hinne peab olema täisarv 1 kuni 5.';

  if (comment.length > 1000) errors.comment = 'Kommentaar võib olla kuni 1000 tähemärki.';

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    data: { studentName: anonymous ? null : studentName, anonymous, className, subjectId, grade, comment },
  };
}

module.exports = { validateFeedback };
