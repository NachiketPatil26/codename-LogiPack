import React, { useMemo, useState } from 'react';
import { Container } from '../../types';
import { DoubleSide, Vector3, Color } from 'three';
import { Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ContainerModelProps {
  container: Container;
}

const ContainerModel: React.FC<ContainerModelProps> = ({ container }) => {
  // Convert dimensions to three.js units
  const length = container.length;
  const width = container.width;
  const height = container.height;
  
  // Define container colors with enhanced vibrance
  const floorColor = '#191a20'; // Dark gray but slightly lighter
  const wallColor = '#21222a'; // Medium dark gray
  const frameColor = '#2a2b36'; // Slightly lighter gray
  const accentColor = '#43d9d9'; // Neon cyan
  
  // State for animation and interactivity
  const [hovered, setHovered] = useState(false);
  
  // Create pulsing effect for accent elements
  const accentRef = React.useRef<THREE.Group>(null);
  useFrame((state) => {
    if (accentRef.current) {
      // Subtle pulsing effect
      const t = state.clock.getElapsedTime();
      
      // Apply pulse to accent elements
      accentRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          // @ts-ignore - material property exists
          if (child.material && child.material.emissiveIntensity !== undefined) {
            // @ts-ignore - emissiveIntensity property exists
            child.material.emissiveIntensity = hovered ? 0.8 : (0.4 + Math.sin(t * 3) * 0.2);
          }
        }
      });
    }
  });
  
  // Create frame edges for better visual representation
  const edges = useMemo(() => {
    return [
      // Bottom frame
      [[0, 0, 0], [length, 0, 0]],
      [[0, 0, 0], [0, 0, width]],
      [[length, 0, 0], [length, 0, width]],
      [[0, 0, width], [length, 0, width]],
      
      // Top frame
      [[0, height, 0], [length, height, 0]],
      [[0, height, 0], [0, height, width]],
      [[length, height, 0], [length, height, width]],
      [[0, height, width], [length, height, width]],
      
      // Vertical edges
      [[0, 0, 0], [0, height, 0]],
      [[length, 0, 0], [length, height, 0]],
      [[0, 0, width], [0, height, width]],
      [[length, 0, width], [length, height, width]],
    ];
  }, [length, width, height]);
  
  // Create enhanced measurement markers with labels
  const createMeasurementMarker = (start: Vector3, end: Vector3, label: string, labelPosition?: Vector3) => {
    const points = [start, end];
    const direction = new Vector3().subVectors(end, start);
    const center = new Vector3().addVectors(start, direction.clone().multiplyScalar(0.5));
    
    return (
      <group>
        <Line 
          points={points}
          color={accentColor}
          lineWidth={1.5}
          dashed
          dashSize={3}
          dashScale={1}
          dashOffset={0}
        />
        
        {/* Dimension label */}
        <Text
          position={labelPosition || center}
          fontSize={12}
          color={accentColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.5}
          outlineColor="#000000"
        >
          {label}
        </Text>
      </group>
    );
  };
  
  return (
    <group position={[0, 0, 0]}>
      {/* Floor of the container with enhanced grid pattern */}
      <mesh 
        position={[length/2, 0, width/2]} 
        rotation={[0, 0, 0]} 
        receiveShadow
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[length, 1, width]} />
        <meshStandardMaterial 
          color={floorColor} 
          roughness={0.7} 
          metalness={0.3}
          envMapIntensity={1.5}
        />
      </mesh>
      
      {/* Container walls - enhanced semi-transparent with glow effect */}
      <group>
        {/* Left wall */}
        <mesh 
          position={[length/2, height/2, 0]} 
          rotation={[0, 0, 0]}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[length, height, 0.5]} />
          <meshStandardMaterial 
            color={wallColor} 
            transparent 
            opacity={0.2} 
            side={DoubleSide}
            roughness={0.4}
            metalness={0.2}
            emissive={new Color(accentColor).multiplyScalar(0.2)}
            emissiveIntensity={hovered ? 0.3 : 0.1}
          />
        </mesh>
        
        {/* Right wall */}
        <mesh 
          position={[length/2, height/2, width]} 
          rotation={[0, 0, 0]}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[length, height, 0.5]} />
          <meshStandardMaterial 
            color={wallColor} 
            transparent 
            opacity={0.2} 
            side={DoubleSide}
            roughness={0.4}
            metalness={0.2}
            emissive={new Color(accentColor).multiplyScalar(0.2)}
            emissiveIntensity={hovered ? 0.3 : 0.1}
          />
        </mesh>
        
        {/* Back wall */}
        <mesh 
          position={[0, height/2, width/2]} 
          rotation={[0, 0, 0]}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[0.5, height, width]} />
          <meshStandardMaterial 
            color={wallColor} 
            transparent 
            opacity={0.2} 
            side={DoubleSide}
            roughness={0.4}
            metalness={0.2}
            emissive={new Color(accentColor).multiplyScalar(0.2)}
            emissiveIntensity={hovered ? 0.3 : 0.1}
          />
        </mesh>
      </group>
      
      {/* Container frame corners with glowing effect */}
      <group ref={accentRef}>
        {/* Bottom frame corners */}
        <mesh 
          position={[0, 0, 0]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh 
          position={[length, 0, 0]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh 
          position={[0, 0, width]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh 
          position={[length, 0, width]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
        
        {/* Top frame corners */}
        <mesh 
          position={[0, height, 0]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh 
          position={[length, height, 0]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh 
          position={[0, height, width]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh 
          position={[length, height, width]} 
          castShadow
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial 
            color={frameColor} 
            roughness={0.4} 
            metalness={0.6} 
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
      </group>
      
      {/* Frame edges with enhanced glow */}
      {edges.map((points, index) => {
        const [start, end] = points;
        return (
          <Line 
            key={index}
            points={[new Vector3(start[0], start[1], start[2]), new Vector3(end[0], end[1], end[2])]}
            color={hovered ? accentColor : frameColor}
            lineWidth={2}
            transparent
            opacity={0.8}
          />
        );
      })}
      
      {/* Enhanced grid on the floor for better spatial reference */}
      <gridHelper 
        args={[Math.max(length, width), Math.max(length, width) / 20, accentColor, '#334155']} 
        rotation={[Math.PI / 2, 0, 0]} 
        position={[length/2, 0.5, width/2]} 
      />
      
      {/* Enhanced dimension indicators with labels */}
      <group position={[0, 0, 0]}>
        {createMeasurementMarker(
          new Vector3(0, -15, 0), 
          new Vector3(length, -15, 0),
          `${length} cm`,
          new Vector3(length/2, -25, 0)
        )}
        {createMeasurementMarker(
          new Vector3(-15, 0, 0), 
          new Vector3(-15, height, 0),
          `${height} cm`,
          new Vector3(-25, height/2, 0)
        )}
        {createMeasurementMarker(
          new Vector3(0, -15, width+15), 
          new Vector3(0, -15, 0),
          `${width} cm`,
          new Vector3(0, -25, width/2)
        )}
      </group>
      
      {/* Container volume indicator */}
      <group position={[length/2, height + 30, width/2]}>
        <Text
          fontSize={16}
          color={accentColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.5}
          outlineColor="#000000"
        >
          {`Volume: ${(length * width * height / 1000000).toFixed(2)} m³`}
        </Text>
      </group>
    </group>
  );
};

export default ContainerModel;