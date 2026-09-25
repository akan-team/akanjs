/** One parsed page of the generated documentation corpus, as `DocCorpus` hands it to the service. */
export interface DocCorpusEntry {
  href: string;
  title: string;
  section: string;
  category: string;
  priority: string;
  summary: string;
  body: string;
}
