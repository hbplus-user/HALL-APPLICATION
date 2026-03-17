const fs = require('fs');

const sampleText = `1. The nervous system works closely with which system to regulate body functions?
a) Respiratory system
b) Digestive system
c) Endocrine system
d) Skeletal system
ANSWER: c

2. Where in the human body are the bones of the hand located?
a) Skull
b) Foot
c) Arm
d) Spine
ANSWER: a

3. What is the powerhouse of the cell?
a) Nucleus
b) Mitochondria
c) Ribosome
d) Golgi apparatus
ANSWER: b`;

const questions = [];

// More robust regex logic that looks for the start of any number followed by a dot.
const qRegex = /^(\d+)\.\s+([\s\S]+?)(?=\n[a-d]\)|\s+[a-d]\))/gm;

let match;
while ((match = qRegex.exec(sampleText)) !== null) {
  const blockStart = match.index;
  const blockEnd = sampleText.indexOf('\n\n', blockStart);
  
  const block = blockEnd !== -1 ? sampleText.substring(blockStart, blockEnd) : sampleText.substring(blockStart);
  
  const text = match[2].trim().replace(/\n/g, ' ');
  
  const opts = [...block.matchAll(/[a-d]\)\s*([^\n\r]+)/g)].map(m => m[1].trim());
  if (opts.length < 2) continue; // Needs options
  
  const ansMatch = block.match(/ANSWER:\s*([a-d])/i);
  const ansLetter = ansMatch ? ansMatch[1].toLowerCase() : 'a';
  const correctAnswer = { a: 1, b: 2, c: 3, d: 4 }[ansLetter] || 1;
  
  questions.push({ text, options: opts, correctAnswer });
}

console.log(JSON.stringify(questions, null, 2));
