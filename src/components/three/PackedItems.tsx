import React, { useRef, useState, useEffect } from 'react';
import { PackedItem } from '../../types';
import { Mesh, Color, Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';

interface PackedItemsProps {
  packedItems: PackedItem[];
  onItemHover?: (item: PackedItem | null) => void;
}

const PackedItems: React.FC<PackedItemsProps> = ({ packedItems, onItemHover }) => {
  const meshRefs = useRef<(Mesh | null)[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { camera } = useThree();
  
  // Pass the hovered item to the parent component
  useEffect(() => {
    if (onItemHover) {
      if (hoveredIndex !== null) {
        onItemHover(packedItems[hoveredIndex]);
      } else {
        onItemHover(null);
      }
    }
  }, [hoveredIndex, packedItems, onItemHover]);

  // Animate items on hover and update matrices
  useFrame((state) => {
    meshRefs.current.forEach((mesh, index) => {
      if (mesh) {
        // Update matrix world for proper rendering
        mesh.updateMatrixWorld();
        
        // Add subtle floating animation to hovered item
        if (hoveredIndex === index) {
          const hoverOffset = Math.sin(state.clock.elapsedTime * 2) * 0.5;
          // @ts-ignore - scale property exists on mesh
          mesh.scale.setScalar(1.02 + hoverOffset * 0.01);
        } else {
          // @ts-ignore - scale property exists on mesh
          mesh.scale.lerp(new Vector3(1, 1, 1), 0.1);
        }
      }
    });
  });

  return (
    <group>
      {packedItems.map((item, index) => {
        const mesh = meshRefs.current[index];
        const isHovered = hoveredIndex === index;
        
        // Calculate adjusted position to account for Three.js box geometry being centered
        // We need to offset by half the dimensions based on the item's rotation
        let xOffset, yOffset, zOffset;
        let itemLength, itemHeight, itemWidth;
        
        if (item.rotation.y === 90) {
          // Width and length are swapped when rotated 90 degrees on Y axis
          xOffset = item.width / 2;
          yOffset = item.height / 2;
          zOffset = item.length / 2;
          itemLength = item.width;
          itemHeight = item.height;
          itemWidth = item.length;
        } else if (item.rotation.x === 90) {
          // Height and width are swapped when rotated 90 degrees on X axis
          xOffset = item.length / 2;
          yOffset = item.width / 2;
          zOffset = item.height / 2;
          itemLength = item.length;
          itemHeight = item.width;
          itemWidth = item.height;
        } else {
          // No rotation or other rotations
          xOffset = item.length / 2;
          yOffset = item.height / 2;
          zOffset = item.width / 2;
          itemLength = item.length;
          itemHeight = item.height;
          itemWidth = item.width;
        }
        
        // Parse the color and create a darker version for the edges
        const itemColor = item.color || '#43d9d9'; // Default to neon cyan if no color specified
        const color = new Color(itemColor);
        const darkerColor = new Color(itemColor).multiplyScalar(0.7);
        
        return (
          <group key={item.id} 
            position={[
              item.position.x + xOffset, 
              item.position.y + yOffset, 
              item.position.z + zOffset
            ]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredIndex(index);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredIndex(null);
              document.body.style.cursor = 'auto';
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Focus camera on this item
              const targetPosition = new Vector3(
                item.position.x + xOffset,
                item.position.y + yOffset,
                item.position.z + zOffset
              );
              // Move camera closer to this item
              const cameraDirection = camera.position.clone().sub(targetPosition).normalize();
              const newPosition = targetPosition.clone().add(cameraDirection.multiplyScalar(300));
              camera.position.lerp(newPosition, 0.5);
              camera.lookAt(targetPosition);
            }}
          >
            <mesh 
              ref={el => meshRefs.current[index] = el}
              rotation={[
                item.rotation.x * (Math.PI / 180),
                item.rotation.y * (Math.PI / 180),
                item.rotation.z * (Math.PI / 180)
              ]}
            >
              <boxGeometry args={[itemLength, itemHeight, itemWidth]} />
              <meshStandardMaterial 
                color={color} 
                transparent 
                opacity={isHovered ? 0.95 : 0.85} 
                metalness={0.4}
                roughness={0.3}
                emissive={color}
                emissiveIntensity={isHovered ? 0.8 : 0.2}
                envMapIntensity={1.5}
              />
            </mesh>
            
            {/* Enhanced wireframe outline */}
            {mesh && (
              <lineSegments>
                <edgesGeometry attach="geometry" args={[mesh.geometry]} />
                <lineBasicMaterial 
                  attach="material" 
                  color={isHovered ? color : darkerColor} 
                  linewidth={2} 
                  transparent 
                  opacity={isHovered ? 1 : 0.7} 
                />
              </lineSegments>
            )}
            
            {/* Enhanced item label that appears on hover */}
            {isHovered && (
              <group position={[0, itemHeight / 2 + 15, 0]}>
                <Text
                  position={[0, 0, 0]}
                  fontSize={14}
                  color="white"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.5}
                  outlineColor="#000000"
                  fillOpacity={1}
                >
                  {item.name}
                </Text>
                <Text
                  position={[0, -15, 0]}
                  fontSize={10}
                  color="#cccccc"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.3}
                  outlineColor="#000000"
                >
                  {`${itemLength}×${itemWidth}×${itemHeight} cm`}
                </Text>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
};

export default PackedItems;