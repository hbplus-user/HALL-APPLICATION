const fullText = `1. The nervous system works closely with which system to regulate body functions?
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
const blocks = fullText.split(/(?=\d+\.)/);

for (const block of blocks) {
  if (!block.trim()) continue;
  
  console.log("--- Processing Block ---");
  console.log(block);
  
  // Try relaxed match
  const qMatch = block.match(/^\d+\.\s+([\s\S]+?)(?=\s+[a-d]\)|\n[a-d]\))/);
  if (!qMatch) {
    console.log("Failed to match question text!");
    continue;
  }
  
  console.log("Matched Q Text:", qMatch[1].trim());

  const opts = [...block.matchAll(/[a-d]\)\s*([^\n\r]+)/g)].map(m => m[1].trim());
  console.log("Matched Options:", opts.length, opts);
  
  if (opts.length < 2) {
    console.log("Less than 2 options found!");
    continue;
  }
  
  const ansMatch = block.match(/ANSWER:\s*([a-d])/i);
  if (!ansMatch) {
    console.log("No answer found!");
  }
  
  const ansLetter = ansMatch ? ansMatch[1].toLowerCase() : 'a';
  const correctAnswer = { a: 1, b: 2, c: 3, d: 4 }[ansLetter] || 1;
  
  questions.push({ text: qMatch[1].trim(), options: opts, correctAnswer });
}

console.log("\n==== Final Questions ====");
console.log(JSON.stringify(questions, null, 2));
