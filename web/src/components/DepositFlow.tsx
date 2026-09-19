/**
 * The four things that happen to a deposit, drawn rather than described.
 *
 * Each card already carried a sentence; the sentence is still there. What it
 * could not say is that this is one continuous movement — money leaves a wallet,
 * sits somewhere neither party controls, and comes back. Four still icons would
 * have read as four unrelated features, so each scene animates the one motion
 * it is about, and the four run on the same five-second clock a beat apart, so
 * the row reads left to right the way the money does.
 *
 * Deliberately small and slow. This sits under the event list on a page people
 * come to in order to do something else, and anything faster would pull the eye
 * off the thing they came for. Every keyframe is in `globals.css` behind a
 * `prefers-reduced-motion` guard that leaves the end state on screen — the
 * scenes are drawn so that their resting position is the one that makes sense
 * standing still.
 */

const WALLET = "M3 13.5a3 3 0 0 1 3-3h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3z";

/** The contract: a box with a seam, so it reads as a container and not a card. */
function Vault({ x = 44 }: { x?: number }) {
  return (
    <g transform={`translate(${x} 10)`}>
      <rect
        x="0.75"
        y="0.75"
        width="26.5"
        height="26.5"
        rx="5"
        className="stroke-border-hover"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M0.75 10h26.5" className="stroke-border-hover" strokeWidth="1.5" />
    </g>
  );
}

function Wallet({ x = 0 }: { x?: number }) {
  return (
    <g transform={`translate(${x} 7)`}>
      <path d={WALLET} className="stroke-border-hover" strokeWidth="1.5" fill="none" />
      <circle cx="17" cy="17" r="1.6" className="fill-border-hover" />
    </g>
  );
}

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 76 48"
      role="img"
      aria-hidden
      className="h-11 w-[76px] overflow-visible"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 01 — the deposit leaves the wallet and is taken in. */
function Reserve() {
  return (
    <Scene>
      <Wallet />
      <Vault />
      <circle r="4" cy="24" cx="30" className="flow-coin fill-accent" />
    </Scene>
  );
}

/**
 * 02 — it sits there, and the ring is the only thing that moves.
 *
 * The lock is shut and stays shut: this is the one step whose whole point is
 * that nothing happens to the money while it lasts.
 */
function Held() {
  return (
    <Scene>
      <Vault x={24} />
      <circle
        cx="38"
        cy="24"
        r="17"
        className="flow-ring stroke-accent"
        strokeWidth="1.5"
      />
      <path
        d="M34 21v-2.5a4 4 0 0 1 8 0V21"
        className="stroke-accent-soft"
        strokeWidth="1.5"
      />
      <rect x="32" y="21" width="12" height="9" rx="2" className="fill-accent-soft" />
    </Scene>
  );
}

/** 03 — the code is entered and the deposit comes straight back. */
function CheckIn() {
  return (
    <Scene>
      <Wallet />
      <Vault />
      <circle r="4" cy="24" cx="30" className="flow-coin-back fill-accent" />
      <path
        d="M52 24.5l3.5 3.5 6-7"
        className="flow-check stroke-success"
        strokeWidth="2"
        pathLength={1}
      />
    </Scene>
  );
}

/**
 * 04 — what the no-shows left, going to the people who turned up.
 *
 * Three coins out of one, because "split among attendees" is a division and a
 * single arrow would have read as a transfer.
 */
function Share() {
  return (
    <Scene>
      <Vault x={24} />
      <circle cx="38" cy="24" r="4" className="fill-accent-soft" />
      <circle cx="38" cy="24" r="3.5" className="flow-share-a fill-accent" />
      <circle cx="38" cy="24" r="3.5" className="flow-share-b fill-accent" />
      <circle cx="38" cy="24" r="3.5" className="flow-share-c fill-accent" />
    </Scene>
  );
}

const SCENES = [Reserve, Held, CheckIn, Share];

export function DepositFlowArt({ step }: { step: number }) {
  const Art = SCENES[step] ?? Reserve;
  return <Art />;
}
