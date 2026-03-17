const fs = require('fs');

const sampleText = `1. The nervous system works closely with which system to regulate body functions?
a) Respiratory system
b) Digestive system
c) Endocrine system
d) Skeletal system
ANSWER: c

2. Another question here?
a) Yes
b) No
ANSWER: a`;

const questions = [];
const blocks = sampleText.split(/(?=\d+\.)/);

for (const block of blocks) {
  if (!block.trim()) continue;
  
  // Match question text (number dot space ... up to an option like a) )
  const qMatch = block.match(/^\d+\.\s+([\s\S]+?)(?=\s+[a-d]\)|\n[a-d]\))/);
  if (!qMatch) {
    console.log("Failed question match on block:", block);
    continue;
  }
  
  // Match options a) through d)
  const opts = [...block.matchAll(/[a-d]\)\s*([^\n\r]+)/gi)].map(m => m[1].trim());
  if (opts.length < 2) {
    console.log("Failed options match on block:", block);
    continue; // Must have at least two options
  }
  
  // Match answer
  const ansMatch = block.match(/ANSWER:\s*([a-d])/i);
  const ansLetter = ansMatch ? ansMatch[1].toLowerCase() : 'a';
  const correctAnswer = { a: 1, b: 2, c: 3, d: 4 }[ansLetter] || 1;
  
  questions.push({ text: qMatch[1].trim().replace(/\n/g, ' '), options: opts, correctAnswer });
}

console.log("Extracted Questions:", questions);
