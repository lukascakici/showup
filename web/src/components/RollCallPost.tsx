import { getTweet } from "react-tweet/api";
import { enrichTweet } from "react-tweet";
import { SectionLabel } from "./ui";

/**
 * Undo the escaping the syndication API applies to post text.
 *
 * It hands back `&amp;`, `&lt;` and `&gt;` rather than the characters, so text
 * rendered as text shows the escapes. react-tweet's own answer is
 * `dangerouslySetInnerHTML`, which works because those three are all that ever
 * appear. Decoding the three instead keeps this a string all the way to the
 * DOM, so there is no path by which anything fetched from X can be markup here.
 * `&amp;` goes last, or `&amp;lt;` would decode twice.
 */
function unescapeText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * The organizer's post about the hackathon, on the page people land on.
 *
 * Fetched here on the server and rendered as our own markup, rather than
 * dropped in as X's embed. That embed is a third-party bundle plus a tracking
 * frame, on a page whose whole job is to be fast on hotel wifi while somebody
 * stands in a doorway, and it arrives wearing its own light-grey chrome. This
 * way there is no client JavaScript from anyone, nothing that follows the
 * visitor, and the card is in the same palette as everything around it.
 *
 * What is deliberately dropped: likes, replies, follow buttons, the reply box.
 * None of it is true by the time somebody reads this in a room, none of it is
 * actionable here, and all of it is vertical space between the visitor and the
 * list of who has arrived.
 *
 * The words are quoted as written. Their wording and their emoji belong to
 * whoever posted them; the house rule against emoji governs our own copy.
 */
export async function RollCallPost({ id }: { id: string }) {
  // A failed fetch drops the post and nothing else. This page is a door: Join
  // has to survive X being down, rate-limiting us, or deciding this post is no
  // longer public.
  const raw = await getTweet(id).catch(() => null);
  if (!raw) return null;

  const tweet = enrichTweet(raw);
  const photo = tweet.photos?.[0];

  return (
    <section>
      <SectionLabel className="mb-3">POSTS FROM X</SectionLabel>
      <a
        href={tweet.url}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-2xl border border-border-strong bg-surface transition-colors hover:border-border-hover"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            {/* Plain `img`: one 32px avatar off a host the optimizer would need
                configuring for, to save nothing at this size. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tweet.user.profile_image_url_https}
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-full"
            />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">
                {tweet.user.name}
              </div>
              <div className="truncate text-xs text-muted-2">@{tweet.user.screen_name}</div>
            </div>
          </div>

          <p className="whitespace-pre-wrap text-sm leading-[1.55] text-muted text-pretty">
            {tweet.entities.map((entity, i) =>
              // The trailing t.co link is the photo below, spelled out. Showing
              // it would be showing the same thing twice, once unreadably.
              entity.type === "media" ? null : (
                <span
                  key={i}
                  className={entity.type === "text" ? undefined : "text-accent-soft"}
                >
                  {unescapeText(entity.text)}
                </span>
              ),
            )}
          </p>
        </div>

        {photo && (
          // Capped and cropped rather than shown whole: there are four of these
          // and the post is one card on the way to a button.
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.url}
            alt=""
            className="h-40 w-full border-t border-border object-cover sm:h-48"
          />
        )}
      </a>
    </section>
  );
}
