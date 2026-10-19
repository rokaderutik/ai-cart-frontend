import { Check, Leaf, MessageCircle, Sparkles } from 'lucide-react'

/** Decorative preview of the future experience, not a live recommendation. */
export function MealIllustration() {
  return (
    <div
      className="relative mx-auto w-full max-w-[510px] pb-7 pt-7 lg:pt-0"
      aria-hidden="true"
    >
      <div className="soft-grid absolute right-0 top-7 h-64 w-32 opacity-40" />
      <div className="relative mx-4 overflow-hidden rounded-[180px_180px_100px_100px] bg-[#ece9df] px-7 pb-16 pt-12 sm:mx-7">
        <div className="absolute left-0 top-0 h-full w-full bg-[radial-gradient(ellipse_at_50%_40%,#f3f1e8_0%,transparent_70%)]" />
        <div className="relative mb-2 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#716a5c]">
          <span className="h-px w-6 bg-[#b5ac9a]" /> Made for your cravings{' '}
          <span className="h-px w-6 bg-[#b5ac9a]" />
        </div>
        <svg
          viewBox="0 0 360 340"
          className="relative mx-auto w-full max-w-[360px] drop-shadow-[0_18px_12px_rgba(88,71,42,0.14)]"
        >
          <defs>
            <radialGradient id="plate">
              <stop offset="0" stopColor="#fffefa" />
              <stop offset="0.8" stopColor="#f7f4ed" />
              <stop offset="1" stopColor="#ddd9cd" />
            </radialGradient>
            <radialGradient id="sauce">
              <stop stopColor="#e2a954" />
              <stop offset="1" stopColor="#b77434" />
            </radialGradient>
            <linearGradient id="pasta" x2="1" y2="1">
              <stop stopColor="#f2d59a" />
              <stop offset="1" stopColor="#d5a05b" />
            </linearGradient>
          </defs>
          <ellipse cx="183" cy="174" rx="153" ry="150" fill="url(#plate)" />
          <circle cx="183" cy="174" r="128" fill="none" stroke="#e5e0d5" />
          <circle cx="183" cy="174" r="108" fill="#e9d7ac" />
          <circle cx="183" cy="174" r="103" fill="url(#sauce)" />
          {[
            [130, 116, -25],
            [179, 109, 20],
            [220, 130, -20],
            [115, 162, 30],
            [160, 153, -15],
            [204, 171, 40],
            [249, 168, 10],
            [132, 209, -35],
            [180, 207, 20],
            [219, 221, -30],
            [171, 246, -5],
            [230, 191, 75],
            [183, 132, 60],
            [153, 180, 65],
          ].map(([x, y, rotation], index) => (
            <g
              key={index}
              transform={`translate(${x} ${y}) rotate(${rotation})`}
            >
              <rect
                x="-21"
                y="-11"
                width="43"
                height="23"
                rx="7"
                fill="url(#pasta)"
                stroke="#c4914f"
                strokeWidth="1.2"
              />
              <path
                d="M-13-7v14M-6-8v16M1-8v16M8-8v16M15-7v14"
                stroke="#f9e1ad"
                strokeWidth="1.8"
                opacity=".7"
              />
            </g>
          ))}
          <g fill="#a73928">
            <ellipse
              cx="114"
              cy="192"
              rx="13"
              ry="9"
              transform="rotate(25 114 192)"
            />
            <ellipse cx="231" cy="112" rx="12" ry="9" />
            <ellipse cx="207" cy="249" rx="12" ry="8" />
          </g>
          <g fill="#547344" stroke="#375c35" strokeWidth=".8">
            <path d="M171 179q-42-15-29-41 34 1 29 41Z" />
            <path d="M172 179q-4-42 25-41 11 28-25 41Z" />
            <path d="M173 179q35-23 44 4-20 20-44-4Z" />
            <path d="M126 127q-25-12-14-29 24 4 14 29Z" />
            <path d="M227 224q21-25 34-7-8 22-34 7Z" />
          </g>
          <g stroke="#fff2d1" strokeWidth="3" strokeLinecap="round">
            <path d="m143 115 8 2m49 82 8-4m-66 35 9 2m84-71 7 3m-60 73 9-2m-59-78 7-2m90-25 6 4" />
          </g>
          <g fill="#4f573c">
            <circle cx="119" cy="147" r="1.5" />
            <circle cx="213" cy="146" r="1.4" />
            <circle cx="161" cy="220" r="1.7" />
            <circle cx="237" cy="208" r="1.4" />
            <circle cx="183" cy="108" r="1.3" />
          </g>
        </svg>
        <div className="relative mt-2 text-center">
          <p className="display-heading text-2xl text-[#595346]">
            A good choice feels easy.
          </p>
          <p className="mt-2 text-[11px] tracking-wide text-[#746d60]">
            Your taste. Your pace. Your perfect plate.
          </p>
        </div>
      </div>
      <div className="absolute -left-1 top-[28%] max-w-[210px] -rotate-3 rounded-2xl border border-white bg-white p-3.5 shadow-[0_8px_30px_#4a382014] sm:left-0">
        <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          <MessageCircle className="size-3 text-primary" /> Your next
          conversation
        </div>
        <p className="text-[13px] leading-relaxed">
          “Something creamy,
          <br />a little spicy, and vegetarian.”
        </p>
      </div>
      <div className="absolute -right-1 top-[54%] hidden rotate-3 rounded-2xl border border-white bg-white px-4 py-3 shadow-[0_8px_30px_#4a382014] min-[480px]:block sm:right-0">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="flex size-6 items-center justify-center rounded-full bg-[#edf2e8] text-[#506b3c]">
            <Leaf className="size-3.5" />
          </span>{' '}
          A little more you.
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Check className="size-3 text-[#506b3c]" /> Guided by your preferences
        </div>
      </div>
      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        <Sparkles className="size-3 text-primary" /> A taste of what’s coming
      </div>
    </div>
  )
}
