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

export interface DisplayCargoItem {
  groupKey: string; // A unique key for this group of identical items (e.g., generated from properties)
  id: string; // Use the ID of the first item in the group, or generate a group-specific ID
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  color: string;
  constraints?: ItemConstraint[]; // Constraints from the form input
  // These specific boolean flags might be derived from constraints or directly from form
  isFragile?: boolean; 
  isRotatable?: boolean; 
  displayQuantity: number; // The quantity for this group to display in the UI
}