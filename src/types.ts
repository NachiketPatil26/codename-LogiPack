export interface Container {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  maxWeight: number;
}

export enum ConstraintType {
  MUST_BE_ON_TOP = 'MUST_BE_ON_TOP',
  MUST_BE_ON_BOTTOM = 'MUST_BE_ON_BOTTOM',
  MUST_BE_UPRIGHT = 'MUST_BE_UPRIGHT',
  CAN_SUPPORT_WEIGHT = 'CAN_SUPPORT_WEIGHT',
  FRAGILE = 'FRAGILE'
}

export interface ItemConstraint {
  type: ConstraintType;
  value?: number; // For weight-related constraints
}

export interface CargoItem {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  color: string;
  quantity: number;
  constraints?: ItemConstraint[];
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface PackedItem extends CargoItem {
  position: Position;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  color: string;
}

export interface PackedResult {
  packedItems: PackedItem[];
  unpackedItems: CargoItem[];
  containerFillPercentage: number;
  weightCapacityPercentage: number;
  totalWeight: number;
  progress?: number;
  type?: string;
}