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

// Split by question number pattern "1. ", "2. " etc.
// The regex looks for start of line or space, followed by digits, dot, space.
const blocks = sampleText.split(/(?:^|\n)\s*\d+\.\s+/);

// the first block might be empty if the string starts with "1. "
for (let i = 1; i < blocks.length; i++) {
  const block = blocks[i].trim();
  if (!block) continue;
  
  // Find where the options start (a) )
  const firstOptionMatches = block.match(/(?:\n|\s)[a-d]\)\s/i);
  if (!firstOptionMatches) {
    console.log("No options found in block", i);
    continue; // skipping if no options
  }
  
  const questionTextEnd = firstOptionMatches.index;
  const text = block.substring(0, questionTextEnd).trim().replace(/\n/g, ' ');
  
  const opts = [...block.matchAll(/[a-d]\)\s*([^\n\r]+)/gi)].map(m => m[1].trim());
  if (opts.length < 2) continue;
  
  const ansMatch = block.match(/ANSWER:\s*([a-d])/i);
  const ansLetter = ansMatch ? ansMatch[1].toLowerCase() : 'a';
  const correctAnswer = { a: 1, b: 2, c: 3, d: 4 }[ansLetter] || 1;
  
  questions.push({ text, options: opts, correctAnswer });
}

console.log(JSON.stringify(questions, null, 2));
