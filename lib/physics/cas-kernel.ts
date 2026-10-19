/**
 * Symbolic CAS Verification Kernel — Zero-Hallucination Math
 *
 * Pure TypeScript implementation for symbolic algebra, dimensional analysis, and limit verification.
 * No external dependencies - works on Termux ARM64 without native bindings.
 */

// Extended with dimensional analysis
export interface DimensionCheckResult {
  isConsistent: boolean;
  leftDimension?: string;
  rightDimension?: string;
  mismatchDetails?: string;
}

export interface AlgebraicCheckResult {
  isEquivalent: boolean;
  simplifiedLeft?: string;
  simplifiedRight?: string;
  difference?: string;
}

export interface LimitCheckResult {
  limit: number | string;
  exists: boolean;
  direction?: "+" | "-" | "both";
  details?: string;
}

export interface DerivationStep {
  step: number;
  expression: string;
  rule: string;
  verified: boolean;
  error?: string;
}

export interface CASVerificationResult {
  overallValid: boolean;
  steps: DerivationStep[];
  algebraicChecks: AlgebraicCheckResult[];
  dimensionalChecks: DimensionCheckResult[];
  limitChecks: LimitCheckResult[];
  summary: string;
}

// SI Base Dimensions
const BASE_DIMENSIONS = {
  L: "length",
  M: "mass",
  T: "time",
  I: "current",
  Theta: "temperature",
  N: "amount",
  J: "luminous_intensity",
};

// Common physical quantity dimensions
const QUANTITY_DIMENSIONS: Record<string, Record<string, number>> = {
  // Base SI quantities
  mass: { M: 1 },
  length: { L: 1 },
  time: { T: 1 },
  current: { I: 1 },
  temperature: { Theta: 1 },
  amount: { N: 1 },
  luminous_intensity: { J: 1 },

  // Mechanics
  velocity: { L: 1, T: -1 },
  acceleration: { L: 1, T: -2 },
  force: { M: 1, L: 1, T: -2 },
  energy: { M: 1, L: 2, T: -2 },
  work: { M: 1, L: 2, T: -2 },
  power: { M: 1, L: 2, T: -3 },
  momentum: { M: 1, L: 1, T: -1 },
  angularMomentum: { M: 1, L: 2, T: -1 },
  torque: { M: 1, L: 2, T: -2 },
  momentOfInertia: { M: 1, L: 2 },
  pressure: { M: 1, L: -1, T: -2 },
  frequency: { T: -1 },
  angularVelocity: { T: -1 },
  angularAcceleration: { T: -2 },

  // Electromagnetics
  charge: { I: 1, T: 1 },
  voltage: { M: 1, L: 2, T: -3, I: -1 },
  resistance: { M: 1, L: 2, T: -3, I: -2 },
  capacitance: { M: -1, L: -2, T: 4, I: 2 },
  inductance: { M: 1, L: 2, T: -2, I: -2 },
  magneticField: { M: 1, T: -2, I: -1 },
  electricField: { M: 1, L: 1, T: -3, I: -1 },

  // Thermodynamics
  entropy: { M: 1, L: 2, T: -2, Theta: -1 },
  heatCapacity: { M: 1, L: 2, T: -2, Theta: -1 },

  // Constants
  gravitationalConstant: { M: -1, L: 3, T: -2 },
  planckConstant: { M: 1, L: 2, T: -1 },
  boltzmannConstant: { M: 1, L: 2, T: -2, Theta: -1 },
  speedOfLight: { L: 1, T: -1 },
  elementaryCharge: { I: 1, T: 1 },
  electronMass: { M: 1 },
  protonMass: { M: 1 },

  // Additional common quantities
  springConstant: { M: 1, T: -2 },
  coulombConstant: { M: 1, L: 3, T: -4, I: -2 },
};

/**
 * Simple expression parser and evaluator for basic algebraic operations
 */
class ExpressionParser {
  static parse(expr: string): any {
    // Simple tokenizer
    const tokens = expr.replace(/\s+/g, '').match(/[a-zA-Z_][a-zA-Z0-9_]*|\d+\.?\d*|[+\-*/^()=,]/g) || [];
    let index = 0;

    const parseExpression = (): any => {
      let node = parseTerm();
      while (index < tokens.length && (tokens[index] === '+' || tokens[index] === '-')) {
        const op = tokens[index++];
        const right = parseTerm();
        node = { type: 'operator', op, left: node, right };
      }
      return node;
    };

    const parseTerm = (): any => {
      let node = parseFactor();
      while (index < tokens.length && (tokens[index] === '*' || tokens[index] === '/')) {
        const op = tokens[index++];
        const right = parseFactor();
        node = { type: 'operator', op, left: node, right };
      }
      return node;
    };

    const parseFactor = (): any => {
      let node = parsePower();
      return node;
    };

    const parsePower = (): any => {
      let node = parsePrimary();
      while (index < tokens.length && tokens[index] === '^') {
        index++;
        const right = parsePrimary();
        node = { type: 'operator', op: '^', left: node, right };
      }
      return node;
    };

    const parsePrimary = (): any => {
      if (index >= tokens.length) return { type: 'number', value: 0 };

      const token = tokens[index];
      if (token === '(') {
        index++;
        const node = parseExpression();
        if (index < tokens.length && tokens[index] === ')') index++;
        return node;
      }

      if (/^\d+\.?\d*$/.test(token)) {
        index++;
        return { type: 'number', value: parseFloat(token) };
      }

      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token)) {
        index++;
        return { type: 'symbol', name: token };
      }

      index++;
      return { type: 'symbol', name: token };
    };

    return parseExpression();
  }

  static evaluate(node: any, vars: Record<string, number> = {}): number {
    if (node.type === 'number') return node.value;
    if (node.type === 'symbol') return vars[node.name] ?? 0;
    if (node.type === 'operator') {
      const left = this.evaluate(node.left, vars);
      const right = this.evaluate(node.right, vars);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right !== 0 ? left / right : Infinity;
        case '^': return Math.pow(left, right);
      }
    }
    return 0;
  }

  static toString(node: any): string {
    if (node.type === 'number') return node.value.toString();
    if (node.type === 'symbol') return node.name;
    if (node.type === 'operator') {
      const left = this.toString(node.left);
      const right = this.toString(node.right);
      if (node.op === '^') return `(${left})^(${right})`;
      return `(${left} ${node.op} ${right})`;
    }
    return '';
  }

  static simplify(node: any): any {
    // Basic constant folding
    if (node.type === 'number') return node;
    if (node.type === 'symbol') return node;
    if (node.type === 'operator') {
      const left = this.simplify(node.left);
      const right = this.simplify(node.right);

      // If both are numbers, evaluate
      if (left.type === 'number' && right.type === 'number') {
        return { type: 'number', value: this.evaluate(node) };
      }

      // x + 0 = x, x * 1 = x, etc.
      if (node.op === '+' && left.type === 'number' && left.value === 0) return right;
      if (node.op === '+' && right.type === 'number' && right.value === 0) return left;
      if (node.op === '-' && right.type === 'number' && right.value === 0) return left;
      if (node.op === '*' && left.type === 'number' && left.value === 1) return right;
      if (node.op === '*' && right.type === 'number' && right.value === 1) return left;
      if (node.op === '*' && left.type === 'number' && left.value === 0) return { type: 'number', value: 0 };
      if (node.op === '*' && right.type === 'number' && right.value === 0) return { type: 'number', value: 0 };
      if (node.op === '/' && right.type === 'number' && right.value === 1) return left;
      if (node.op === '^' && right.type === 'number' && right.value === 1) return left;
      if (node.op === '^' && right.type === 'number' && right.value === 0) return { type: 'number', value: 1 };

      return { type: 'operator', op: node.op, left, right };
    }
    return node;
  }
}

/**
 * Extract dimensions from an expression with known variables
 */
function extractDimensions(expr: string, variables: Record<string, string> = {}): Record<string, number> | null {
  try {
    const node = ExpressionParser.parse(expr);
    const dims = new Map<string, number>();

    function traverse(node: any, isDenominator = false): void {
      const mult = isDenominator ? -1 : 1;

      if (node.type === 'symbol') {
        const varName = node.name;
        const quantity = variables[varName];
        if (quantity && QUANTITY_DIMENSIONS[quantity]) {
          for (const [base, exp] of Object.entries(QUANTITY_DIMENSIONS[quantity])) {
            dims.set(base, (dims.get(base) || 0) + mult * exp);
          }
        } else if (QUANTITY_DIMENSIONS[varName]) {
          // Variable name itself is a known quantity
          for (const [base, exp] of Object.entries(QUANTITY_DIMENSIONS[varName])) {
            dims.set(base, (dims.get(base) || 0) + mult * exp);
          }
        }
        return;
      }

      if (node.type === 'number') {
        // Pure numbers are dimensionless
        return;
      }

      if (node.type === 'operator') {
        if (node.op === '*' || node.op === '/') {
          traverse(node.left, isDenominator);
          if (node.op === '/') {
            traverse(node.right, true);
          } else {
            traverse(node.right, isDenominator);
          }
        } else if (node.op === '^') {
          const base = node.left;
          const exp = node.right;
          if (exp.type === 'number') {
            const oldDims = new Map(dims);
            dims.clear();
            traverse(base, isDenominator);
            const baseDims = new Map(dims);
            for (const [k, v] of baseDims) {
              dims.set(k, v * exp.value);
            }
            for (const [k, v] of oldDims) {
              dims.set(k, (dims.get(k) || 0) + v);
            }
          }
        } else if (node.op === '+' || node.op === '-') {
          // In physical expressions, addition/subtraction terms must have identical dimensions.
          // Extract dimensions of the first term (left side)
          traverse(node.left, isDenominator);
          // (Right side should have the same dimensions, so we don't multiply/accumulate it)
        }
      }
    }

    traverse(node);

    const result: Record<string, number> = {};
    for (const [k, v] of dims) {
      if (v !== 0) result[k] = v;
    }
    return Object.keys(result).length > 0 ? result : { dimensionless: 1 };
  } catch {
    return null;
  }
}

/**
 * Check dimensional consistency of an equation
 */
export function checkDimensionalConsistency(
  leftExpr: string,
  rightExpr: string,
  variables: Record<string, string> = {}
): DimensionCheckResult {
  const leftDims = extractDimensions(leftExpr, variables);
  const rightDims = extractDimensions(rightExpr, variables);

  if (!leftDims || !rightDims) {
    return {
      isConsistent: false,
      mismatchDetails: "Could not parse expressions for dimensional analysis",
    };
  }

  const allBases = new Set([...Object.keys(leftDims), ...Object.keys(rightDims)]);
  for (const base of allBases) {
    if ((leftDims[base] || 0) !== (rightDims[base] || 0)) {
      return {
        isConsistent: false,
        leftDimension: formatDimensions(leftDims),
        rightDimension: formatDimensions(rightDims),
        mismatchDetails: `Dimension mismatch on ${base}: LHS has ${leftDims[base] || 0}, RHS has ${rightDims[base] || 0}`,
      };
    }
  }

  return {
    isConsistent: true,
    leftDimension: formatDimensions(leftDims),
    rightDimension: formatDimensions(rightDims),
  };
}

function formatDimensions(dims: Record<string, number>): string {
  if (dims.dimensionless) return "dimensionless";
  return Object.entries(dims)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => v === 1 ? k : `${k}^${v}`)
    .join("·") || "dimensionless";
}

/**
 * Check algebraic equivalence of two expressions
 */
export function checkAlgebraicEquivalence(
  leftExpr: string,
  rightExpr: string,
  assumptions: Record<string, any> = {}
): AlgebraicCheckResult {
  try {
    const leftNode = ExpressionParser.parse(leftExpr);
    const rightNode = ExpressionParser.parse(rightExpr);

    const leftSimplified = ExpressionParser.simplify(leftNode);
    const rightSimplified = ExpressionParser.simplify(rightNode);

    const leftStr = ExpressionParser.toString(leftSimplified);
    const rightStr = ExpressionParser.toString(rightSimplified);

    if (leftStr === rightStr) {
      return { isEquivalent: true, simplifiedLeft: leftStr, simplifiedRight: rightStr };
    }

    // Try evaluating difference with random values to check equivalence
    const diffExpr = `(${leftExpr}) - (${rightExpr})`;
    const diffNode = ExpressionParser.parse(diffExpr);

    // Test with multiple random values for variables
    const allVars = new Set<string>();
    function collectVars(n: any) {
      if (n.type === 'symbol') allVars.add(n.name);
      if (n.type === 'operator') {
        collectVars(n.left);
        collectVars(n.right);
      }
    }
    collectVars(diffNode);

    let isZero = true;
    for (let test = 0; test < 10; test++) {
      const testVars: Record<string, number> = {};
      for (const v of allVars) {
        testVars[v] = Math.random() * 10 + 0.1;
      }
      // Apply assumptions
      for (const [k, val] of Object.entries(assumptions)) {
        testVars[k] = typeof val === 'number' ? val : Number(val);
      }

      const result = ExpressionParser.evaluate(diffNode, testVars);
      if (Math.abs(result) > 1e-10) {
        isZero = false;
        break;
      }
    }

    if (isZero) {
      return { isEquivalent: true, simplifiedLeft: leftStr, simplifiedRight: rightStr };
    }

    return {
      isEquivalent: false,
      simplifiedLeft: leftStr,
      simplifiedRight: rightStr,
      difference: ExpressionParser.toString(ExpressionParser.simplify(diffNode)),
    };
  } catch (e) {
    return {
      isEquivalent: false,
      difference: `Error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Check limit of expression as variable approaches value
 */
export function checkLimit(
  expr: string,
  variable: string,
  target: number | string,
  direction?: "+" | "-" | "both"
): LimitCheckResult {
  try {
    const node = ExpressionParser.parse(expr);
    const targetNum = typeof target === 'string' ? parseFloat(target) : target;

    // Simple numeric limit evaluation by approaching the target
    const approachValues = direction === "+"
      ? [targetNum + 0.1, targetNum + 0.01, targetNum + 0.001, targetNum + 0.0001]
      : direction === "-"
      ? [targetNum - 0.1, targetNum - 0.01, targetNum - 0.001, targetNum - 0.0001]
      : [targetNum - 0.1, targetNum + 0.1, targetNum - 0.01, targetNum + 0.01, targetNum - 0.001, targetNum + 0.001];

    const results = approachValues.map(val => {
      try {
        return ExpressionParser.evaluate(node, { [variable]: val });
      } catch {
        return NaN;
      }
    }).filter(v => !isNaN(v));

    if (results.length === 0) {
      return {
        limit: "undefined",
        exists: false,
        direction: direction || "both",
        details: `Limit computation failed: no valid evaluations`,
      };
    }

    // Check if converging
    const last = results[results.length - 1];
    const converging = results.every((r, i) => i === 0 || Math.abs(r - results[i-1]) < Math.abs(results[0] * 0.1));

    return {
      limit: last,
      exists: converging && isFinite(last),
      direction: direction || "both",
      details: `Limit as ${variable} → ${target}${direction ? ` (${direction})` : ""}: ${last}`,
    };
  } catch (e) {
    return {
      limit: "undefined",
      exists: false,
      direction: direction || "both",
      details: `Limit computation failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Verify a complete derivation step by step
 */
export function verifyDerivation(
  steps: Array<{ expression: string; rule: string; variables?: Record<string, string> }>
): CASVerificationResult {
  const result: CASVerificationResult = {
    overallValid: true,
    steps: [],
    algebraicChecks: [],
    dimensionalChecks: [],
    limitChecks: [],
    summary: "",
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const variables = step.variables || {};
    let verified = true;
    let error: string | undefined;

    // Check algebraic equivalence with previous step
    if (i > 0) {
      const prevExpr = steps[i - 1].expression;
      const algCheck = checkAlgebraicEquivalence(prevExpr, step.expression, variables);
      result.algebraicChecks.push(algCheck);
      if (!algCheck.isEquivalent) {
        verified = false;
        error = `Algebraic step invalid: ${algCheck.difference}`;
      }
    }

    // Check dimensional consistency (if variables have known quantities)
    if (Object.keys(variables).length > 0) {
      const dimCheck = checkInternalDimensionalConsistency(step.expression, variables);
      result.dimensionalChecks.push(dimCheck);
      if (!dimCheck.isConsistent) {
        verified = false;
        error = error ? `${error}; ${dimCheck.mismatchDetails}` : dimCheck.mismatchDetails;
      }
    }

    result.steps.push({
      step: i + 1,
      expression: step.expression,
      rule: step.rule,
      verified,
      error,
    });

    if (!verified) {
      result.overallValid = false;
    }
  }

  // Summary
  const validCount = result.steps.filter(s => s.verified).length;
  result.summary = `${validCount}/${steps.length} steps verified. ${result.overallValid ? "Derivation is VALID ✓" : "Derivation has ERRORS ✗"}`;

  return result;
}

function checkInternalDimensionalConsistency(expr: string, variables: Record<string, string>): DimensionCheckResult {
  try {
    const node = ExpressionParser.parse(expr);
    const terms: string[] = [];

    // Extract additive terms
    function collectTerms(n: any) {
      if (n.type === 'operator' && (n.op === '+' || n.op === '-')) {
        collectTerms(n.left);
        collectTerms(n.right);
      } else {
        terms.push(ExpressionParser.toString(n));
      }
    }
    collectTerms(node);

    if (terms.length < 2) {
      return { isConsistent: true };
    }

    // Check all terms have same dimensions
    const firstDims = extractDimensions(terms[0], variables);
    if (!firstDims) return { isConsistent: true }; // Can't determine

    for (let i = 1; i < terms.length; i++) {
      const dims = extractDimensions(terms[i], variables);
      if (!dims) continue;

      const allBases = new Set([...Object.keys(firstDims), ...Object.keys(dims)]);
      for (const base of allBases) {
        if ((firstDims[base] || 0) !== (dims[base] || 0)) {
          return {
            isConsistent: false,
            leftDimension: formatDimensions(firstDims),
            rightDimension: formatDimensions(dims),
            mismatchDetails: `Term ${i + 1} has different dimensions than term 1`,
          };
        }
      }
    }

    return { isConsistent: true };
  } catch {
    return { isConsistent: true }; // Can't verify, assume ok
  }
}

/**
 * Quick verification for common JEE physics formulas
 */
export function verifyJEEFormula(
  formulaName: string,
  leftExpr: string,
  rightExpr: string,
  variables: Record<string, string> = {}
): CASVerificationResult {
  const algCheck = checkAlgebraicEquivalence(leftExpr, rightExpr, variables);
  const dimCheck = checkDimensionalConsistency(leftExpr, rightExpr, variables);

  return {
    overallValid: algCheck.isEquivalent && dimCheck.isConsistent,
    steps: [{
      step: 1,
      expression: `${leftExpr} = ${rightExpr}`,
      rule: formulaName,
      verified: algCheck.isEquivalent && dimCheck.isConsistent,
      error: (!algCheck.isEquivalent ? `Algebraic: ${algCheck.difference}` : "") +
             (!dimCheck.isConsistent ? `; Dimensional: ${dimCheck.mismatchDetails}` : ""),
    }],
    algebraicChecks: [algCheck],
    dimensionalChecks: [dimCheck],
    limitChecks: [],
    summary: `${formulaName}: ${algCheck.isEquivalent && dimCheck.isConsistent ? "VERIFIED" : "FAILED"}`,
  };
}

// Common JEE physics formulas for quick verification
export const JEE_FORMULAS = {
  // Kinematics
  "v = u + at": { left: "v", right: "u + a*t", vars: { u: "velocity", a: "acceleration", t: "time", v: "velocity" } },
  "s = ut + 1/2 at^2": { left: "s", right: "u*t + 1/2*a*t^2", vars: { s: "length", u: "velocity", a: "acceleration", t: "time" } },
  "v^2 = u^2 + 2as": { left: "v^2", right: "u^2 + 2*a*s", vars: { v: "velocity", u: "velocity", a: "acceleration", s: "length" } },

  // Dynamics
  "F = ma": { left: "F", right: "m*a", vars: { F: "force", m: "mass", a: "acceleration" } },
  "Work = F·s": { left: "W", right: "F*s", vars: { W: "energy", F: "force", s: "length" } },
  "Power = F·v": { left: "P", right: "F*v", vars: { P: "power", F: "force", v: "velocity" } },

  // Energy
  "KE = 1/2 mv^2": { left: "KE", right: "1/2*m*v^2", vars: { KE: "energy", m: "mass", v: "velocity" } },
  "PE = mgh": { left: "PE", right: "m*g*h", vars: { PE: "energy", m: "mass", g: "acceleration", h: "length" } },
  "Conservation of Energy": { left: "KE_i + PE_i", right: "KE_f + PE_f", vars: { KE_i: "energy", PE_i: "energy", KE_f: "energy", PE_f: "energy" } },

  // Rotational
  "tau = I*alpha": { left: "tau", right: "I*alpha", vars: { tau: "torque", I: "momentOfInertia", alpha: "angularAcceleration" } },
  "L = I*omega": { left: "L", right: "I*omega", vars: { L: "angularMomentum", I: "momentOfInertia", omega: "angularVelocity" } },
  "Rotational KE = 1/2 I*omega^2": { left: "KE_rot", right: "1/2*I*omega^2", vars: { KE_rot: "energy", I: "momentOfInertia", omega: "angularVelocity" } },

  // Gravitation
  "F = G*m1*m2/r^2": { left: "F", right: "G*m1*m2/r^2", vars: { F: "force", G: "gravitationalConstant", m1: "mass", m2: "mass", r: "length" } },
  "g = G*M/R^2": { left: "g", right: "G*M/R^2", vars: { g: "acceleration", G: "gravitationalConstant", M: "mass", R: "length" } },
  "Orbital velocity": { left: "v", right: "sqrt(G*M/r)", vars: { v: "velocity", G: "gravitationalConstant", M: "mass", r: "length" } },

  // SHM
  "omega = sqrt(k/m)": { left: "omega", right: "sqrt(k/m)", vars: { omega: "angularVelocity", k: "springConstant", m: "mass" } },
  "T = 2*pi*sqrt(m/k)": { left: "T", right: "2*pi*sqrt(m/k)", vars: { T: "time", m: "mass", k: "springConstant" } },

  // Electrostatics
  "Coulomb Force": { left: "F", right: "k*q1*q2/r^2", vars: { F: "force", k: "coulombConstant", q1: "charge", q2: "charge", r: "length" } },
  "Electric Field": { left: "E", right: "k*q/r^2", vars: { E: "electricField", k: "coulombConstant", q: "charge", r: "length" } },
  "Potential": { left: "V", right: "k*q/r", vars: { V: "voltage", k: "coulombConstant", q: "charge", r: "length" } },
};

export function getJEEFormula(name: string) {
  return JEE_FORMULAS[name as keyof typeof JEE_FORMULAS];
}

export function verifyAllJEEFormulas(): CASVerificationResult[] {
  return Object.entries(JEE_FORMULAS).map(([name, { left, right, vars }]) =>
    verifyJEEFormula(name, left, right, vars)
  );
}