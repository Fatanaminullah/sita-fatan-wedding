/**
 * The monogram, drawn and then filled, on a loop.
 *
 * The SVG the owner exported was a PNG in an <svg> wrapper: zero paths, four
 * base64 <image> tags, 1.1MB. Nothing to animate. These seven paths are
 * potrace's trace of monogram-bordered.png, 6KB of real geometry.
 *
 * potrace outlines filled regions rather than producing centrelines, which
 * suits the ask exactly: stroke the outline and draw it with
 * stroke-dashoffset, then flood the fill in behind it. The line draws, then
 * fills, then the whole mark releases and begins again.
 *
 * `pathLength={1}` normalises every path to a unit length, so one
 * dasharray works for all seven regardless of their real perimeters.
 *
 * Timing lives in per-path keyframe percentages rather than animation-delay.
 * A delay phase-shifts the whole cycle including the fade-out, so the mark
 * would dissolve unevenly; percentages keep all seven locked together on
 * every loop.
 *
 * prefers-reduced-motion renders the end state: filled, still, no loop. The
 * brief requires the site to be fully usable static.
 */
export function MonogramMark({
  size = 132,
  className = '',
  color = '#5E040E',
}: {
  size?: number
  className?: string
  color?: string
}) {
  return (
    <>
      <style>{`
@keyframes mono-draw-0 {
  0%, 2% { stroke-dashoffset: 1; fill-opacity: 0; }
  26% { stroke-dashoffset: 0; fill-opacity: 0; }
  52% { stroke-dashoffset: 0; fill-opacity: 0; }
  64%, 88% { stroke-dashoffset: 0; fill-opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; fill-opacity: 0; opacity: 0; }
}
@keyframes mono-draw-1 {
  0%, 2% { stroke-dashoffset: 1; fill-opacity: 0; }
  26% { stroke-dashoffset: 0; fill-opacity: 0; }
  52% { stroke-dashoffset: 0; fill-opacity: 0; }
  64%, 88% { stroke-dashoffset: 0; fill-opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; fill-opacity: 0; opacity: 0; }
}
@keyframes mono-draw-2 {
  0%, 22.0% { stroke-dashoffset: 1; fill-opacity: 0; }
  33.2% { stroke-dashoffset: 0; fill-opacity: 0; }
  52% { stroke-dashoffset: 0; fill-opacity: 0; }
  64%, 88% { stroke-dashoffset: 0; fill-opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; fill-opacity: 0; opacity: 0; }
}
@keyframes mono-draw-3 {
  0%, 25.2% { stroke-dashoffset: 1; fill-opacity: 0; }
  36.4% { stroke-dashoffset: 0; fill-opacity: 0; }
  52% { stroke-dashoffset: 0; fill-opacity: 0; }
  64%, 88% { stroke-dashoffset: 0; fill-opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; fill-opacity: 0; opacity: 0; }
}
@keyframes mono-draw-4 {
  0%, 28.4% { stroke-dashoffset: 1; fill-opacity: 0; }
  39.599999999999994% { stroke-dashoffset: 0; fill-opacity: 0; }
  52% { stroke-dashoffset: 0; fill-opacity: 0; }
  64%, 88% { stroke-dashoffset: 0; fill-opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; fill-opacity: 0; opacity: 0; }
}
@keyframes mono-draw-5 {
  0%, 31.6% { stroke-dashoffset: 1; fill-opacity: 0; }
  42.800000000000004% { stroke-dashoffset: 0; fill-opacity: 0; }
  52% { stroke-dashoffset: 0; fill-opacity: 0; }
  64%, 88% { stroke-dashoffset: 0; fill-opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; fill-opacity: 0; opacity: 0; }
}
@keyframes mono-draw-6 {
  0%, 34.8% { stroke-dashoffset: 1; fill-opacity: 0; }
  46.0% { stroke-dashoffset: 0; fill-opacity: 0; }
  52% { stroke-dashoffset: 0; fill-opacity: 0; }
  64%, 88% { stroke-dashoffset: 0; fill-opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; fill-opacity: 0; opacity: 0; }
}
  .mono-p0 { animation: mono-draw-0 11s cubic-bezier(0.65,0,0.35,1) infinite; }
  .mono-p1 { animation: mono-draw-1 11s cubic-bezier(0.65,0,0.35,1) infinite; }
  .mono-p2 { animation: mono-draw-2 11s cubic-bezier(0.65,0,0.35,1) infinite; }
  .mono-p3 { animation: mono-draw-3 11s cubic-bezier(0.65,0,0.35,1) infinite; }
  .mono-p4 { animation: mono-draw-4 11s cubic-bezier(0.65,0,0.35,1) infinite; }
  .mono-p5 { animation: mono-draw-5 11s cubic-bezier(0.65,0,0.35,1) infinite; }
  .mono-p6 { animation: mono-draw-6 11s cubic-bezier(0.65,0,0.35,1) infinite; }
  .mono-svg path {
    fill: currentColor;
    stroke: currentColor;
    stroke-width: 6;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    vector-effect: non-scaling-stroke;
  }
  @media (prefers-reduced-motion: reduce) {
    .mono-svg path { animation: none !important; stroke-dashoffset: 0; fill-opacity: 1; opacity: 1; }
  }
`}</style>
      <svg
        className={`mono-svg ${className}`}
        width={size}
        height={size}
        viewBox="0 0 2000 2000"
        style={{ color }}
        role="img"
        aria-label="The Sita and Fatan monogram"
      >
        <g transform="translate(0,2000) scale(0.1,-0.1)">
        <path className="mono-p0" pathLength={1} d="M9667 16364 c-592 -68 -1188 -306 -1807 -721 -240 -160 -402 -285
-717 -551 l-183 -154 6 -86 c20 -291 -137 -485 -436 -537 -52 -9 -101 -20
-109 -24 -19 -10 -179 -289 -307 -536 -422 -818 -703 -1684 -824 -2540 -42
-299 -58 -475 -71 -799 -11 -273 -1 -721 20 -916 5 -47 15 -134 21 -195 25
-247 74 -536 154 -904 44 -200 138 -527 232 -801 212 -623 492 -1210 885
-1857 43 -70 45 -72 84 -73 65 -1 173 -27 241 -59 175 -82 266 -262 236 -468
l-12 -78 173 -170 c319 -315 600 -538 930 -737 854 -513 1739 -662 2602 -438
281 73 514 160 760 282 386 193 615 358 1260 912 117 100 149 133 147 150 -12
87 -13 226 -2 275 41 186 184 292 454 338 l48 8 129 225 c144 250 379 713 483
950 59 133 125 297 221 545 91 235 245 752 301 1007 75 348 109 541 149 853
53 418 65 1128 25 1513 -6 53 -15 142 -21 197 -102 951 -421 1966 -908 2885
-103 195 -234 427 -249 442 -4 4 -51 11 -104 17 -197 22 -328 103 -400 249
-32 64 -33 72 -33 182 0 63 3 131 7 150 7 35 7 35 -135 156 -279 239 -467 386
-677 530 -589 406 -1133 646 -1692 749 -245 44 -634 58 -881 29z m619 -75
c529 -51 1055 -234 1574 -547 295 -178 482 -314 922 -670 l176 -143 0 -132
c-1 -112 3 -142 21 -197 70 -202 225 -321 477 -365 47 -8 89 -17 94 -20 14 -8
159 -281 273 -511 720 -1457 995 -2849 847 -4284 -117 -1133 -519 -2360 -1111
-3390 -166 -289 -154 -276 -241 -290 -147 -25 -262 -83 -345 -174 -56 -61 -86
-117 -108 -201 -16 -62 -21 -187 -10 -247 6 -34 3 -38 -144 -180 -701 -678
-1482 -1091 -2296 -1214 -140 -21 -519 -29 -685 -15 -840 75 -1664 496 -2424
1239 l-138 135 6 71 c8 89 -13 221 -46 296 -44 98 -133 184 -238 231 -54 25
-193 59 -237 59 -30 0 -36 7 -96 108 -135 226 -227 396 -370 682 -465 928
-755 1877 -851 2785 -35 330 -40 424 -40 800 -1 380 5 490 40 825 109 1038
462 2112 1022 3108 95 168 98 173 137 182 256 63 411 151 484 271 47 79 62
147 65 280 l3 126 84 75 c349 309 754 605 1099 803 466 269 979 448 1434 500
139 16 478 18 622 4z" />
        <path className="mono-p1" pathLength={1} d="M9715 16139 c-548 -53 -1196 -313 -1782 -715 -171 -117 -420 -309
-659 -506 l-71 -59 -6 -107 c-3 -59 -12 -134 -21 -167 -50 -179 -170 -328
-327 -404 -78 -37 -198 -71 -254 -71 -19 0 -33 -18 -83 -107 -357 -642 -606
-1257 -787 -1946 -36 -135 -45 -177 -86 -367 -61 -292 -110 -638 -141 -1015
-16 -195 -16 -912 0 -1110 51 -620 144 -1118 313 -1675 185 -606 471 -1256
826 -1876 l75 -132 74 -11 c330 -49 552 -311 556 -656 l1 -99 121 -117 c575
-555 1242 -934 1909 -1083 235 -53 532 -82 722 -71 717 42 1368 290 1984 756
112 84 169 131 465 378 l136 115 0 82 c0 320 169 575 440 665 35 12 89 25 120
28 l55 6 77 140 c99 177 284 543 378 745 303 653 533 1369 659 2055 128 688
154 1514 70 2185 -123 985 -393 1847 -874 2786 -176 345 -151 315 -281 347
-153 37 -279 101 -358 181 -102 104 -145 211 -170 424 -10 81 -19 121 -33 140
-11 15 -82 80 -159 146 -776 660 -1582 1047 -2329 1116 -128 12 -431 11 -560
-1z m709 -98 c377 -61 682 -162 1056 -352 376 -190 784 -468 1139 -776 l79
-68 6 -65 c26 -251 82 -396 204 -523 98 -102 240 -175 400 -206 l83 -15 87
-166 c498 -952 806 -1923 926 -2920 159 -1319 -69 -2660 -694 -4090 -84 -191
-301 -623 -393 -779 l-72 -124 -75 -18 c-93 -23 -239 -95 -305 -150 -78 -64
-143 -147 -185 -234 -52 -108 -70 -180 -77 -308 l-6 -109 -141 -128 c-368
-335 -653 -537 -1016 -719 -434 -217 -820 -327 -1270 -361 -402 -31 -855 45
-1270 212 -241 98 -561 268 -790 421 -211 141 -383 281 -567 461 -96 93 -123
125 -123 146 0 55 -33 218 -61 305 -88 265 -261 419 -525 465 l-71 13 -115
206 c-374 665 -652 1332 -834 2000 -300 1100 -336 2308 -104 3481 101 510 253
997 480 1535 70 165 326 680 393 789 l42 70 90 22 c109 26 179 55 262 107 163
101 279 308 298 530 11 136 7 129 108 214 208 177 526 415 737 550 532 341
1085 549 1605 602 153 16 551 5 699 -18z" />
        <path className="mono-p2" pathLength={1} d="M9290 12941 c0 -6 46 -101 103 -213 l102 -203 5 -1265 5 -1265 90
-68 c104 -78 308 -217 318 -217 4 0 7 311 7 690 l0 690 230 0 c377 0 741 -28
1110 -85 117 -18 467 -88 547 -109 28 -8 54 -11 57 -8 3 3 6 113 6 244 0 223
-1 239 -17 234 -44 -14 -388 -96 -478 -115 -335 -68 -498 -82 -1007 -88 l-448
-5 0 862 0 863 153 -7 c443 -19 926 -80 1356 -172 159 -34 687 -166 876 -218
49 -14 91 -23 94 -20 3 3 -22 112 -55 242 l-60 237 -1497 3 c-929 1 -1497 -1
-1497 -7z" />
        <path className="mono-p3" pathLength={1} d="M10029 11839 c-6 -3 -9 -26 -7 -50 l3 -44 110 -6 c260 -15 470 -70
690 -181 102 -51 224 -133 296 -197 56 -50 63 -52 118 -35 28 9 -154 172 -285
256 -147 94 -391 190 -579 227 -113 23 -328 41 -346 30z" />
        <path className="mono-p4" pathLength={1} d="M9300 11674 c-412 -122 -681 -388 -766 -759 -26 -113 -25 -344 3
-475 77 -359 287 -609 794 -944 79 -52 150 -100 157 -106 9 -8 12 -169 12
-740 l0 -730 -105 -210 c-58 -115 -105 -212 -105 -215 0 -3 189 -5 420 -5 231
0 420 1 420 3 0 2 -47 97 -105 211 l-105 208 2 604 3 605 191 -129 c379 -256
586 -425 751 -612 250 -283 357 -536 370 -876 8 -208 -17 -333 -99 -499 -222
-447 -767 -716 -1453 -715 -492 1 -921 162 -1263 475 -144 133 -300 377 -362
567 -59 185 -85 457 -61 641 61 455 364 809 811 947 142 44 258 62 430 66
l155 4 0 33 0 32 -95 3 c-175 6 -391 -27 -551 -83 -448 -159 -744 -507 -816
-959 -21 -134 -13 -411 15 -541 127 -583 585 -1028 1230 -1194 171 -44 307
-61 512 -61 940 -1 1696 462 1877 1149 31 117 43 369 24 503 -68 480 -357 830
-1106 1345 -88 60 -220 147 -293 194 -706 448 -962 650 -1136 897 -141 201
-202 446 -165 672 43 270 198 476 444 592 l65 30 0 49 c0 27 -3 49 -7 48 -5 0
-46 -11 -93 -25z" />
        <path className="mono-p5" pathLength={1} d="M11414 10868 c44 -163 44 -305 1 -453 -65 -224 -213 -399 -420 -500
-172 -84 -355 -104 -565 -60 -21 4 -20 3 5 -9 54 -25 182 -46 283 -46 485 0
868 437 813 927 -7 57 -14 110 -17 118 -5 13 -73 45 -95 45 -7 0 -9 -9 -5 -22z" />
        <path className="mono-p6" pathLength={1} d="M10020 8806 c0 -30 9 -40 90 -105 262 -209 416 -512 445 -873 l7 -88
36 0 35 0 -7 97 c-23 332 -155 614 -393 844 -80 77 -186 159 -205 159 -5 0 -8
-15 -8 -34z" />
        </g>
      </svg>
    </>
  )
}
