/**
 * Physics Arena — Rapier3D world setup for JEE mechanics simulations
 * Runs in sandboxed iframe (ArtifactDrawer) for client-side physics
 */

// Types for physics state (serialized for postMessage)
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface RigidBodyState {
  handle: number;
  position: Vector3;
  velocity: Vector3;
  angularVelocity: Vector3;
  forces: Vector3;
}

export interface PhysicsWorldConfig {
  gravity: Vector3;
  timestep: number;
  substeps: number;
}

export interface SimulationSnapshot {
  timestamp: number;
  bodies: RigidBodyState[];
  contacts: ContactPoint[];
}

export interface ContactPoint {
  body1: number;
  body2: number;
  point: Vector3;
  normal: Vector3;
  depth: number;
}

export type PhysicsProblemType =
  | "bead_on_parabolic_wire"
  | "double_pendulum"
  | "gyroscope"
  | "central_force";

export interface ProblemConfig {
  type: PhysicsProblemType;
  parameters: Record<string, number>;
}

// JEE Problem Presets
export const JEE_PROBLEMS: Record<PhysicsProblemType, ProblemConfig> = {
  bead_on_parabolic_wire: {
    type: "bead_on_parabolic_wire",
    parameters: {
      wireA: 0.5,       // y = a*x^2
      wireOmega: 2.0,   // rotation rate (rad/s)
      beadMass: 1.0,    // kg
      initialX: 1.0,    // initial x position
      g: 9.81,
    },
  },
  double_pendulum: {
    type: "double_pendulum",
    parameters: {
      length1: 1.0,
      length2: 1.0,
      mass1: 1.0,
      mass2: 1.0,
      angle1: Math.PI / 2,
      angle2: Math.PI / 2,
      g: 9.81,
    },
  },
  gyroscope: {
    type: "gyroscope",
    parameters: {
      spinRate: 50.0,    // rad/s (wheel spin)
      precessionRate: 0, // computed
      mass: 1.0,
      radius: 0.1,
      length: 0.3,
      g: 9.81,
    },
  },
  central_force: {
    type: "central_force",
    parameters: {
      k: 1.0,           // force constant (k/r^2 or kr)
      forceType: 1,     // 1=inverse square, 2=linear (harmonic)
      mass: 1.0,
      angularMomentum: 1.0,
      initialR: 1.0,
      initialVr: 0,
    },
  },
};

/**
 * Create a physics world configuration
 */
export function createWorldConfig(overrides?: Partial<PhysicsWorldConfig>): PhysicsWorldConfig {
  return {
    gravity: { x: 0, y: -9.81, z: 0 },
    timestep: 1 / 60,
    substeps: 4,
    ...overrides,
  };
}

/**
 * Serialize a vector for postMessage
 */
export function serializeVector(v: { x: number; y: number; z: number }): Vector3 {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Deserialize vector from postMessage
 */
export function deserializeVector(v: Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Get problem description for UI
 */
export function getProblemDescription(type: PhysicsProblemType): string {
  const descriptions: Record<PhysicsProblemType, string> = {
    bead_on_parabolic_wire:
      "Bead on rotating parabolic wire (JEE 2019). Find equilibrium positions and stability.",
    double_pendulum: "Double pendulum chaos. Explore sensitive dependence on initial conditions.",
    gyroscope: "Gyroscope precession. Torque-induced precession of a spinning wheel.",
    central_force: "Central force orbits. Kepler-like motion under inverse-square or linear force.",
  };
  return descriptions[type];
}

/**
 * Get problem parameters with defaults
 */
export function getProblemConfig(type: PhysicsProblemType, userParams?: Record<string, number>): ProblemConfig {
  const base = JEE_PROBLEMS[type];
  return {
    ...base,
    parameters: { ...base.parameters, ...userParams },
  };
}