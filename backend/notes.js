const fs = require('fs');
const path = require('path');

const NOTES_PATH = process.env.NOTES_PATH || path.join(__dirname, '..', 'notes.json');

function readNotes() {
  if (!fs.existsSync(NOTES_PATH)) return {};
  return JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8'));
}

function getNote(env, containerName) {
  return readNotes()[`${env}:${containerName}`] || '';
}

function setNote(env, containerName, text) {
  const notes = readNotes();
  notes[`${env}:${containerName}`] = text;
  fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));
}

module.exports = { getNote, setNote, readNotes };
