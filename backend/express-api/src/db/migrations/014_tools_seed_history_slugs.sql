-- Rows required for ai_runs.tool_id FK when saving Document Analyzer / Task / Email runs to History.
INSERT INTO tools (slug, name, description, is_active)
VALUES
  ('document-analyzer', 'Document Analyzer', 'Extract insights from documents and PDFs.', true),
  ('task-generator', 'Task Generator', 'Extract actionable tasks from notes and transcripts.', true),
  ('email-generator', 'Email Generator', 'Draft follow-up and professional emails.', true)
ON CONFLICT (slug) DO NOTHING;
