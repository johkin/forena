import { AppLink } from "./app-link";
import { useEffect, useState } from "react";
import type { components } from "../../backend/contract/generated";
import { MyActivityList, type MyActivity } from "../../src/components/my-activity-list";
import type { ParticipationFetch } from "../../src/components/activity-invitation-response";

type Page = components["schemas"]["MyActivities"];

export function MyActivitiesPage({ request }: { request: ParticipationFetch }) {
  const [items, setItems] = useState<MyActivity[]>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/me/activities?offset=${offset}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        return await response.json() as Page;
      })
      .then(page => {
        if (controller.signal.aborted) return;
        setItems(previous => offset === 0 ? page.activities : [...new Map([...previous, ...page.activities].map(item => [item.id, item])).values()]);
        setNextOffset(page.next_offset);
        setError(undefined);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Aktiviteterna kunde inte hämtas. Försök igen."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, offset, attempt]);
  return <MyActivityList request={request} linkComponent={AppLink} activities={items} loading={loading} error={error}
    retry={() => { setLoading(true); setAttempt(value => value + 1); }}
    loadMore={nextOffset === null ? undefined : () => { setLoading(true); setOffset(nextOffset); }} />;
}
