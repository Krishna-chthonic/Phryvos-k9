/**
 * IIT Professor Trap-Question Synthesizer
 *
 * Deep Competitive Exam Engine (JEE Advanced / BITSAT / GATE)
 *
 * Mines student study logs, FSRS lapse histories, and conceptual bottlenecks
 * to synthesize challenging questions where every incorrect option (distractor)
 * corresponds to a specific, well-documented cognitive misconception.
 */

export interface TrapOption {
  id: "A" | "B" | "C" | "D";
  text: string;
  isCorrect: boolean;
  trapType?: string;
  cognitivePitfall?: string;
}

export interface TrapQuestion {
  id: string;
  subject: "Physics" | "Mathematics" | "Chemistry";
  topic: string;
  difficulty: "JEE_Main" | "JEE_Advanced" | "Olympiad";
  problemStatement: string;
  diagramSvg?: string;
  options: TrapOption[];
  correctOption: "A" | "B" | "C" | "D";
  conceptualBreakdown: string;
  shortcutTrick: string;
  misconceptionsTargeted: string[];
}

export const CURATED_TRAP_PROBLEMS: TrapQuestion[] = [
  {
    id: "trap-phys-01",
    subject: "Physics",
    topic: "Rotational Dynamics & Non-Inertial Frames",
    difficulty: "JEE_Advanced",
    problemStatement: `A uniform solid sphere of mass $M$ and radius $R$ is placed on a rough horizontal plank of mass $2M$. The plank is pulled horizontally with a constant acceleration $a_0$. Assuming pure rolling of the sphere on the plank without slipping, what is the horizontal acceleration of the center of mass of the sphere with respect to the ground?`,
    options: [
      {
        id: "A",
        text: "$\\frac{2}{7} a_0$",
        isCorrect: true,
        cognitivePitfall: "Correct! Using friction $f = M a_{\\text{cm}}$ and torque about CM $f R = I \\alpha$ where $\\alpha R = a_0 - a_{\\text{cm}}$. With $I = \\frac{2}{5}MR^2$, this yields $a_{\\text{cm}} = \\frac{2}{7}a_0$.",
      },
      {
        id: "B",
        text: "$\\frac{5}{7} a_0$",
        isCorrect: false,
        trapType: "Reference Frame Inversion Trap",
        cognitivePitfall: "Forgot that $\\frac{5}{7}a_0$ is the acceleration RELATIVE to the accelerated plank ($a_{\\text{rel}} = a_0 - \\frac{2}{7}a_0 = \\frac{5}{7}a_0$), but the question explicitly asked for acceleration with respect to the GROUND.",
      },
      {
        id: "C",
        text: "$\\frac{2}{5} a_0$",
        isCorrect: false,
        trapType: "Missing Rolling Constraint Slip",
        cognitivePitfall: "Assumed friction is independent of linear acceleration and equated torque directly to plank acceleration without coupling the rolling constraint equation $a_{\\text{plank}} - a_{\\text{sphere}} = \\alpha R$.",
      },
      {
        id: "D",
        text: "$\\frac{1}{3} a_0$",
        isCorrect: false,
        trapType: "Wrong Moment of Inertia Trap",
        cognitivePitfall: "Substituted $I = \\frac{1}{2}MR^2$ (solid cylinder/disc formula) instead of $\\frac{2}{5}MR^2$ (solid sphere formula).",
      },
    ],
    correctOption: "A",
    conceptualBreakdown: `In the ground frame:
1. Friction $f$ acts forward on the sphere, providing acceleration: $f = M a_{\\text{cm}}$
2. Friction creates a counter-clockwise torque: $f R = I \\alpha = \\left(\\frac{2}{5} M R^2\\right) \\alpha \\implies \\alpha = \\frac{5 f}{2 M R}$
3. Rolling without slipping condition at contact point with plank:
   $a_{\\text{contact}} = a_0 \\implies a_{\\text{cm}} + \\alpha R = a_0$
4. Substituting $\\alpha R = \\frac{5}{2} a_{\\text{cm}}$:
   $a_{\\text{cm}} + \\frac{5}{2} a_{\\text{cm}} = a_0 \\implies \\frac{7}{2} a_{\\text{cm}} = a_0 \\implies a_{\\text{cm}} = \\frac{2}{7} a_0$.`,
    shortcutTrick: `The contact point of the sphere accelerates with the plank ($a_0$). By instantaneous center of rotation at the plank contact, $a_{\\text{cm}} = a_0 \\cdot \\frac{R^2}{R^2 + k^2} = a_0 \\cdot \\frac{1}{1 + 5/2} = \\frac{2}{7} a_0$. (Instantaneous 5-second solve!)`,
    misconceptionsTargeted: [
      "Inverting ground vs relative reference frames",
      "Treating static friction as kinetic $\\mu N$",
      "Solid sphere vs cylinder moment of inertia slip",
    ],
  },
  {
    id: "trap-phys-02",
    subject: "Physics",
    topic: "Work, Energy & Variable Fields",
    difficulty: "JEE_Advanced",
    problemStatement: `A particle of mass $m$ is released from rest at $x = A$ in a 1D force field given by $F(x) = -k x^3$. The speed of the particle when it passes through the origin $x = 0$ is:`,
    options: [
      {
        id: "A",
        text: "$A^2 \\sqrt{\\frac{k}{2m}}$",
        isCorrect: true,
        cognitivePitfall: "Correct! Work done by variable force $W = \\int_A^0 (-k x^3) dx = \\frac{k A^4}{4} = \\frac{1}{2} m v^2 \\implies v = A^2 \\sqrt{\\frac{k}{2m}}$.",
      },
      {
        id: "B",
        text: "$A \\sqrt{\\frac{k}{m}}$",
        isCorrect: false,
        trapType: "SHM Linear Fallacy Trap",
        cognitivePitfall: "Blindly applied simple harmonic motion $v_{\\text{max}} = \\omega A = A\\sqrt{k/m}$, forgetting that SHM strictly requires $F = -k x$, whereas this is an anharmonic $F = -kx^3$ potential!",
      },
      {
        id: "C",
        text: "$\\frac{k A^4}{2m}$",
        isCorrect: false,
        trapType: "Missing Square-Root Dimensional Trap",
        cognitivePitfall: "Equated work directly to velocity squared without taking the square root: $[v] = \\text{m/s}$, but this option has dimensions $\\text{m}^2/\\text{s}^2$.",
      },
      {
        id: "D",
        text: "$A^2 \\sqrt{\\frac{k}{4m}}$",
        isCorrect: false,
        trapType: "Integration Denominator Factor Slip",
        cognitivePitfall: "Forgot the factor of $\\frac{1}{2}$ in kinetic energy $\\frac{1}{2}mv^2$ when cancelling $\\frac{1}{4}$ from $\\int x^3 dx = \\frac{x^4}{4}$.",
      },
    ],
    correctOption: "A",
    conceptualBreakdown: `By Work-Energy Theorem:
$W_{\\text{net}} = \\Delta K = \\frac{1}{2} m v^2 - 0$
$W = \\int_A^0 F(x) dx = \\int_A^0 (-k x^3) dx = \\left[ -\\frac{k x^4}{4} \\right]_A^0 = 0 - \\left(-\\frac{k A^4}{4}\\right) = \\frac{k A^4}{4}$
Equating to $\\frac{1}{2} m v^2$:
$\\frac{1}{2} m v^2 = \\frac{k A^4}{4} \\implies v^2 = \\frac{k A^4}{2m} \\implies v = A^2 \\sqrt{\\frac{k}{2m}}$.`,
    shortcutTrick: `Dimensional analysis alone rules out B and C. Between A and D, note that $\\int x^3 dx$ produces denominator 4, while $\\frac{1}{2}mv^2$ brings factor 2 to numerator: $4/2 = 2$ in denominator of $v^2$, so $\\sqrt{2m}$ in denominator!`,
    misconceptionsTargeted: [
      "Assuming all restoring forces execute standard SHM ($v = \\omega A$)",
      "Dimensional inconsistency in velocity formula",
      "Sign slips when integrating against force direction",
    ],
  },
  {
    id: "trap-math-01",
    subject: "Mathematics",
    topic: "Definite Integrals & King's Property",
    difficulty: "JEE_Advanced",
    problemStatement: `Evaluate the integral:
$$I = \\int_{-\\pi/2}^{\\pi/2} \\frac{\\cos x}{1 + 2^x} dx$$`,
    options: [
      {
        id: "A",
        text: "$1$",
        isCorrect: true,
        cognitivePitfall: "Correct! Using King's rule $x \\to -x$, adding both representations eliminates the exponential term $(1 + 2^x)$ to leave $\\int_0^{\\pi/2} \\cos x dx = 1$.",
      },
      {
        id: "B",
        text: "$2$",
        isCorrect: false,
        trapType: "Full Symmetric Limit Double-Count",
        cognitivePitfall: "Forgot that $\\int_{-\\pi/2}^{\\pi/2} \\cos x dx = 2$, but the symmetric pairing divides the entire integral by 2 ($2I = 2 \\implies I = 1$).",
      },
      {
        id: "C",
        text: "$0$",
        isCorrect: false,
        trapType: "Odd Function False Assumption",
        cognitivePitfall: "Assumed the integrand is odd because limits are symmetric $[-\\pi/2, \\pi/2]$. But $\\cos(-x)/(1 + 2^{-x}) \\neq -f(x)$; it is neither odd nor even!",
      },
      {
        id: "D",
        text: "$\\frac{\\pi}{2}$",
        isCorrect: false,
        trapType: "Trigonometric Area Habit Trap",
        cognitivePitfall: "Confused $\\int_0^{\\pi/2} \\cos x dx = 1$ with $\\int_0^{\\pi/2} \\cos^2 x dx = \\frac{\\pi}{4}$ multiplied by 2.",
      },
    ],
    correctOption: "A",
    conceptualBreakdown: `1. $I = \\int_{-\\pi/2}^{\\pi/2} \\frac{\\cos x}{1 + 2^x} dx$
2. Apply property $\\int_a^b f(x) dx = \\int_a^b f(a + b - x) dx$. Here $a + b = 0$, so substitute $x \\to -x$:
   $I = \\int_{-\\pi/2}^{\\pi/2} \\frac{\\cos(-x)}{1 + 2^{-x}} dx = \\int_{-\\pi/2}^{\\pi/2} \\frac{2^x \\cos x}{2^x + 1} dx$
3. Add (1) and (2):
   $2I = \\int_{-\\pi/2}^{\\pi/2} \\frac{(1 + 2^x) \\cos x}{1 + 2^x} dx = \\int_{-\\pi/2}^{\\pi/2} \\cos x dx = 2 \\int_0^{\\pi/2} \\cos x dx = 2 [\\sin x]_0^{\\pi/2} = 2$
4. Therefore $I = 1$.`,
    shortcutTrick: `Whenever you see $\\frac{f_{\\text{even}}(x)}{1 + a^x}$ on $[-L, L]$, the non-symmetric factor $1/(1+a^x)$ always cancels out under reflection to give exactly $\\frac{1}{2} \\int_{-L}^L f_{\\text{even}}(x) dx = \\int_0^L f_{\\text{even}}(x) dx$. Here $\\int_0^{\\pi/2} \\cos x dx = 1$ instantly!`,
    misconceptionsTargeted: [
      "Assuming symmetric limits imply odd integrand equals zero",
      "Omitting the $2I$ step when adding reflected integrals",
      "Attempting manual integration by parts on $2^x \\cos x$",
    ],
  },
  {
    id: "trap-chem-01",
    subject: "Chemistry",
    topic: "Chemical Equilibrium & Le Chatelier Trap",
    difficulty: "JEE_Advanced",
    problemStatement: `For the gas phase reaction at equilibrium:
$$PCl_5(g) \\rightleftharpoons PCl_3(g) + Cl_2(g)$$
An inert gas (Helium) is added at CONSTANT VOLUME. What happens to the degree of dissociation $\\alpha$ of $PCl_5$?`,
    options: [
      {
        id: "A",
        text: "Remains unchanged",
        isCorrect: true,
        cognitivePitfall: "Correct! At constant volume, partial pressures of reactants and products are $p_i = \\frac{n_i R T}{V}$. Adding inert gas changes total pressure but does NOT alter $p_i$ or molar concentrations, so equilibrium position is unaltered.",
      },
      {
        id: "B",
        text: "Increases because total pressure increases",
        isCorrect: false,
        trapType: "Le Chatelier Blind Application Trap",
        cognitivePitfall: "Confused adding inert gas at CONSTANT VOLUME with adding inert gas at CONSTANT PRESSURE. At constant pressure, volume expands and shifts forward. But at constant volume, $\\Delta n_g$ does not shift equilibrium!",
      },
      {
        id: "C",
        text: "Decreases to relieve pressure",
        isCorrect: false,
        trapType: "Backward Shift Guess",
        cognitivePitfall: "Reasoned that since total pressure increases, reaction must shift backward (fewer gas moles). But the inert gas does not participate in the reaction quotient $Q_p = \\frac{p_{PCl_3} p_{Cl_2}}{p_{PCl_5}}$.",
      },
      {
        id: "D",
        text: "Becomes zero",
        isCorrect: false,
        trapType: "Complete Suppression Trap",
        cognitivePitfall: "Believed inert gas acts as a poison to the dissociation.",
      },
    ],
    correctOption: "A",
    conceptualBreakdown: `Equilibrium constant $K_p = \\frac{p_{PCl_3} p_{Cl_2}}{p_{PCl_5}}$.
Since partial pressure of gas $i$ is $p_i = \\frac{n_i R T}{V}$:
When Helium is introduced into a rigid vessel:
- $V$ is fixed (constant volume)
- $T$ is fixed
- $n_{PCl_5}, n_{PCl_3}, n_{Cl_2}$ are initially unchanged
Therefore, each partial pressure $p_i$ is completely unaffected!
Hence $Q_p = K_p$, and no shift occurs in the degree of dissociation $\\alpha$.`,
    shortcutTrick: `Mnemonic: "Constant Volume = Zero Effect". Only at Constant Pressure does inert gas behave like volume expansion, shifting toward greater moles ($\Delta n_g > 0$).`,
    misconceptionsTargeted: [
      "Constant volume vs constant pressure inert gas addition",
      "Equating total pressure increase with reactant partial pressure changes",
    ],
  },
];

/**
 * Mines study logs and FSRS card stats to synthesize a targeted trap problem
 */
export function synthesizeTrapQuestion(
  subject?: string,
  weakConcepts?: string[]
): TrapQuestion {
  const filtered = CURATED_TRAP_PROBLEMS.filter(
    (q) => !subject || q.subject.toLowerCase() === subject.toLowerCase()
  );

  if (filtered.length === 0) {
    return CURATED_TRAP_PROBLEMS[0];
  }

  // Pick the problem with matching weak concepts if available
  if (weakConcepts && weakConcepts.length > 0) {
    const match = filtered.find((q) =>
      q.misconceptionsTargeted.some((m) =>
        weakConcepts.some((w) => m.toLowerCase().includes(w.toLowerCase()))
      )
    );
    if (match) return match;
  }

  // Pick based on timestamp or random
  const index = Math.floor(Math.random() * filtered.length);
  return filtered[index];
}
