import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import Header, { type Page } from "./components/Header";
import AttackLab from "./pages/AttackLab";
import History from "./pages/History";
import Playground, { type EditorState } from "./pages/Playground";
import Security from "./pages/Security";
import type { Attack, Language } from "./types";

export default function App() {
  const [page, setPage] = useState<Page>(() => (location.hash.slice(1) as Page) || "playground");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ language: "python", code: {}, stdin: {} });
  const [attackId, setAttackId] = useState<string | null>(null);

  useEffect(() => { location.hash = page; }, [page]);
  useEffect(() => {
    const load = () => Promise.all([api<Language[]>("/api/languages"), api<Attack[]>("/api/attacks")])
      .then(([l, a]) => { setLanguages(l); setAttacks(a); setError(null); })
      .catch((e) => { setError(e.message); setTimeout(load, 2000); });
    load();
  }, []);

  const loadIntoEditor = (language: string, code: string, stdin: string, aid: string | null = null) => {
    setEditor((s) => ({ language, code: { ...s.code, [language]: code }, stdin: { ...s.stdin, [language]: stdin } }));
    setAttackId(aid);
    setPage("playground");
  };

  return (
    <div className="min-h-full">
      <Header page={page} setPage={setPage} />
      {!languages.length ? (
        <div className="grid h-[70vh] place-items-center text-slate-400">
          <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-cage-400" />{error ? `Waiting for the platform… (${error})` : "Connecting to CodeCage…"}</div>
        </div>
      ) : (
        <main>
          {page === "playground" && <Playground languages={languages} state={editor} attackId={attackId}
            setState={(fn) => { setAttackId(null); setEditor(fn); }} />}
          {page === "attacks" && <AttackLab attacks={attacks} onOpen={(a) => loadIntoEditor(a.language, a.code, "", a.id)} />}
          {page === "history" && <History onLoad={(l, c, s) => loadIntoEditor(l, c, s)} />}
          {page === "security" && <Security languages={languages} />}
        </main>
      )}
    </div>
  );
}
