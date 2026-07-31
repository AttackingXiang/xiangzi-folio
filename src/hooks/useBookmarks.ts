import { useCallback, useEffect, useRef, useState } from "react";
import { bookmarks } from "../lib/bookmarks";
import { loadCache, saveCache } from "../lib/config";
import type { BookmarkNode } from "../types";

export function useBookmarks() {
  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // loadCache() and getTree() are both async and race on mount; if the cache
  // read resolves after the real tree has already loaded, applying it would
  // silently roll the UI back to stale data with no further refresh queued.
  const freshLoaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await bookmarks.getTree();
      freshLoaded.current = true;
      setTree(next); await saveCache(next); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "读取书签失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    loadCache().then((cached) => { if (active && !freshLoaded.current && cached?.length) { setTree(cached); setLoading(false); } });
    refresh();
    const unsubscribe = bookmarks.subscribe(refresh);
    return () => { active = false; unsubscribe(); };
  }, [refresh]);

  return { tree, loading, error, refresh, native: bookmarks.native };
}
