import { useState, useEffect } from 'react';
import { getPacks, addPack, deletePack } from '../../services/questionService';
import { uploadPdf } from '../../services/storageService';
import { showNotification } from '../common/NotificationSystem';

async function extractQuestionsFromPdf(file) {
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs';
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    
    // Group text items by their Y position to reconstruct real lines
    // PDF coordinates go bottom-to-top, so we sort Ys descending
    const lines = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push(item.str);
    }
    const sortedYs = Object.keys(lines).map(Number).sort((a, b) => b - a);
    for (const y of sortedYs) {
      fullText += lines[y].join(' ').trim() + '\n';
    }
  }
  
  console.log('Extracted PDF text (first 800 chars):\n', fullText.substring(0, 800));
  
  const questions = [];
  // Split on question number at start of line
  const blocks = fullText.split(/(?:^|\n)\s*\d+\.\s+/);
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    
    // Find where the first option starts
    const firstOptionMatch = block.match(/(?:\n|\s)[a-d]\)\s/i);
    if (!firstOptionMatch) continue;
    
    const text = block.substring(0, firstOptionMatch.index).trim().replace(/\n/g, ' ');
    if (!text) continue;
    
    // Get all options
    const opts = [...block.matchAll(/(?:^|\n|\s)[a-d]\)\s*([^\n\r]+)/gi)].map(m => m[1].trim()).filter(Boolean);
    if (opts.length < 2) continue;
    
    // Get the answer
    const ansMatch = block.match(/ANSWER:\s*([a-d])/i);
    const ansLetter = ansMatch ? ansMatch[1].toLowerCase() : 'a';
    const correctAnswer = { a: 1, b: 2, c: 3, d: 4 }[ansLetter] || 1;
    
    questions.push({ text, options: opts, correctAnswer });
  }
  
  console.log(`Parsed ${questions.length} questions from PDF`);
  return questions;
}

export default function QuestionManagement() {
  const [packs, setPacks] = useState([]);
  const [filterRole, setFilterRole] = useState('all');
  const [pdfFile, setPdfFile] = useState(null);
  const [packRole, setPackRole] = useState('fitness');
  const [packSubRole, setPackSubRole] = useState('internal');
  const [loading, setLoading] = useState(false);
  const [expandedPacks, setExpandedPacks] = useState(new Set());

  // Manual question form
  const [mqRole, setMqRole] = useState('fitness');
  const [mqSubRole, setMqSubRole] = useState('internal');
  const [mqText, setMqText] = useState('');
  const [mqOptions, setMqOptions] = useState(['', '', '', '']);
  const [mqCorrect, setMqCorrect] = useState(1);

  useEffect(() => { loadPacks(); }, [filterRole]);

  const loadPacks = async () => {
    const all = await getPacks();
    const filtered = filterRole === 'all' ? all : all.filter(p => p.role === filterRole);
    setPacks(filtered);
  };

  const handleUploadPdf = async () => {
    if (!pdfFile) { showNotification('Select a PDF file first.', 'warning'); return; }
    setLoading(true);
    try {
      const questions = await extractQuestionsFromPdf(pdfFile);
      if (!questions.length) {
        showNotification('No questions extracted. Check file format.', 'error');
        return;
      }
      const uploadResult = await uploadPdf(pdfFile, packRole);
      if (!uploadResult) { showNotification('PDF upload failed.', 'error'); return; }
      const pack = await addPack({
        role: packRole,
        subRole: packRole === 'fitness' ? packSubRole : null,
        fileName: pdfFile.name,
        storagePath: uploadResult.path,
        downloadURL: uploadResult.downloadURL,
        questions,
        createdAt: new Date().toISOString(),
      });
      if (pack) {
        setPacks(prev => [...prev, pack]);
        showNotification(`${questions.length} questions from "${pdfFile.name}" added!`, 'success');
        setPdfFile(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSave = async (e) => {
    e.preventDefault();
    if (!mqText.trim() || mqOptions.some(o => !o.trim())) {
      showNotification('Fill in all question fields.', 'warning'); return;
    }
    const question = { text: mqText.trim(), options: mqOptions.map(o => o.trim()), correctAnswer: parseInt(mqCorrect) };
    // Add as a single-question pack
    const pack = await addPack({
      role: mqRole,
      subRole: mqRole === 'fitness' ? mqSubRole : null,
      fileName: `Manual: ${mqText.substring(0, 30)}...`,
      storagePath: null, downloadURL: null,
      questions: [question],
      createdAt: new Date().toISOString(),
    });
    if (pack) {
      setPacks(prev => [...prev, pack]);
      showNotification('Manual question added!', 'success');
      setMqText(''); setMqOptions(['', '', '', '']); setMqCorrect(1);
    }
  };

  const handleDeletePack = async (packId) => {
    if (!window.confirm('Delete this question pack?')) return;
    await deletePack(packId);
    setPacks(prev => prev.filter(p => p.id !== packId));
    setExpandedPacks(prev => {
      const s = new Set(prev);
      s.delete(packId);
      return s;
    });
    showNotification('Pack deleted.', 'success');
  };

  const toggleExpand = (packId) => {
    setExpandedPacks(prev => {
      const s = new Set(prev);
      if (s.has(packId)) s.delete(packId);
      else s.add(packId);
      return s;
    });
  };

  return (
    <div className="question-management-grid">
      <div>
        {/* PDF Upload */}
        <div className="upload-card" style={{ marginBottom: 20 }}>
          <h3 className="section-title">Upload New Question Pack (PDF)</h3>
          <div className="form-group">
            <label htmlFor="question-pack-role">Role</label>
            <select id="question-pack-role" className="form-control" value={packRole} onChange={e => setPackRole(e.target.value)}>
              <option value="fitness">Fitness</option>
              <option value="account">Account</option>
              <option value="operation">Operation</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
          {packRole === 'fitness' && (
            <div className="form-group" id="question-pack-fitness-type-group">
              <label htmlFor="question-pack-fitness-type">Fitness Type</label>
              <select id="question-pack-fitness-type" className="form-control" value={packSubRole} onChange={e => setPackSubRole(e.target.value)}>
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="question-pdf-input" className="file-input-label">
              <i className="fas fa-file-pdf"></i> <span id="pdf-file-label-text">{pdfFile ? pdfFile.name : 'Select PDF File'}</span>
            </label>
            <input type="file" id="question-pdf-input" accept=".pdf" onChange={e => setPdfFile(e.target.files[0])} />
          </div>
          <button className="btn btn-primary" id="upload-pdf-btn" onClick={handleUploadPdf} disabled={loading}>
            <i className="fas fa-upload"></i> {loading ? 'Uploading...' : 'Upload & Parse'}
          </button>
          <div className="token-note mt-4">
            <i className="fas fa-info-circle"></i> <strong>PDF Format:</strong> Format questions like:<br />
            <code>1. Question text?</code><br />
            <code>a) Option 1</code> ... <code>d) Option 4</code><br />
            <code>ANSWER: b</code>
          </div>
        </div>

        {/* Manual Question */}
        <div className="upload-card">
          <h3 className="section-title">Add a Question Manually</h3>
          <form id="manual-question-form" onSubmit={handleManualSave}>
            <div className="form-group">
              <label htmlFor="manual-question-role">Role</label>
              <select id="manual-question-role" className="form-control" value={mqRole} onChange={e => setMqRole(e.target.value)}>
                <option value="fitness">Fitness</option>
                <option value="account">Account</option>
                <option value="operation">Operation</option>
                <option value="marketing">Marketing</option>
              </select>
            </div>
            {mqRole === 'fitness' && (
              <div className="form-group" id="manual-question-fitness-type-group">
                <label htmlFor="manual-question-fitness-type">Fitness Type</label>
                <select id="manual-question-fitness-type" className="form-control" value={mqSubRole} onChange={e => setMqSubRole(e.target.value)}>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="manual-question-text">Question</label>
              <textarea id="manual-question-text" className="form-control" rows={2} required value={mqText} onChange={e => setMqText(e.target.value)} placeholder="What is the capital of France?" />
            </div>
            {mqOptions.map((opt, i) => (
              <div className="form-group" key={i}>
                <label htmlFor={`manual-option-${i + 1}`}>Option {i + 1}</label>
                <input type="text" id={`manual-option-${i + 1}`} className="form-control" required value={opt}
                  onChange={e => { const o = [...mqOptions]; o[i] = e.target.value; setMqOptions(o); }} />
              </div>
            ))}
            <div className="form-group">
              <label htmlFor="manual-correct-answer">Correct Answer</label>
              <select id="manual-correct-answer" className="form-control" required value={mqCorrect} onChange={e => setMqCorrect(parseInt(e.target.value))}>
                {mqOptions.map((_, i) => <option key={i} value={i + 1}>Option {i + 1}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-success" style={{ width: '100%' }}>
              <i className="fas fa-plus-circle"></i> Save Manual Question
            </button>
          </form>
        </div>
      </div>

      <div>
        <div className="section-title">
          <h3>Existing Question Packs</h3>
          <div>
            <select id="filter-pack-role" className="form-control" style={{ display: 'inline-block', width: 'auto' }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="fitness">Fitness</option>
              <option value="account">Account</option>
              <option value="operation">Operation</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
        </div>
        <div className="question-pack-list" id="question-packs-container">
          {packs.length === 0
            ? <p>No question packs found.</p>
            : packs.map(pack => {
                console.log("Rendering pack in UI:", pack);
                return (
              <div key={pack.id} className="question-pack-item">
                <div className="question-pack-header">
                  <h4>{pack.fileName || pack.file_name || "Unnamed Pack"}</h4>
                  <span className={`role-badge role-${pack.role}`}>{pack.role}{pack.subRole ? ` (${pack.subRole})` : ''}</span>
                </div>
                <div className="question-pack-info">{pack.questions?.length || 0} questions</div>
                <div className="question-pack-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => toggleExpand(pack.id)}
                    style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}
                  >
                    <i className={`fas fa-chevron-${expandedPacks.has(pack.id) ? 'up' : 'down'}`}></i>{' '}
                    {expandedPacks.has(pack.id) ? 'Hide Questions' : 'View Questions'}
                  </button>
                  <button className="btn btn-danger btn-sm delete-pack-btn" data-id={pack.id} onClick={() => handleDeletePack(pack.id)}>
                    <i className="fas fa-trash"></i> Delete
                  </button>
                </div>
                
                {/* Expanded Questions View */}
                {expandedPacks.has(pack.id) && pack.questions && pack.questions.length > 0 && (
                  <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #e5e7eb' }}>
                    {pack.questions.map((q, i) => (
                      <div key={i} style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                        <p style={{ fontWeight: '600', margin: '0 0 8px 0', color: '#111827' }}>
                          {i + 1}. {q.text}
                        </p>
                        <ul style={{ listStyleType: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
                          {q.options.map((opt, optIndex) => (
                            <li 
                              key={optIndex} 
                              style={{ 
                                padding: '4px 8px', 
                                margin: '4px 0',
                                borderRadius: '4px',
                                backgroundColor: q.correctAnswer === (optIndex + 1) ? '#dcfce7' : 'transparent',
                                border: q.correctAnswer === (optIndex + 1) ? '1px solid #bbf7d0' : '1px solid transparent',
                                color: q.correctAnswer === (optIndex + 1) ? '#166534' : '#4b5563'
                              }}
                            >
                              {String.fromCharCode(97 + optIndex)}) {opt}
                              {q.correctAnswer === (optIndex + 1) && <span style={{ marginLeft: '8px', fontSize: '0.8rem', fontWeight: 'bold' }}>✓</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
}
