export interface Container {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  maxWeight: number;
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
}