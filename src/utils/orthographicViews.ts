import * as THREE from 'three';
import { Container, PackedItem } from '../types';

/**
 * Creates orthographic views of the container and its packed items
 * Provides standard engineering views: top, front, and side
 */
export type OrthographicView = 'top' | 'front' | 'side';

/**
 * Creates a container mesh for rendering
 */
const createContainerMesh = (container: Container): THREE.Mesh => {
  // Create wireframe geometry for the container
  const geometry = new THREE.BoxGeometry(
    container.length,
    container.height,
    container.width
  );
  
  // Create wireframe material
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
    opacity: 0.3
  });
  
  // Create mesh and center it
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(container.length / 2, container.height / 2, container.width / 2);
  
  return mesh;
};

/**
 * Creates a mesh for a packed item
 */
const createItemMesh = (item: PackedItem): THREE.Mesh => {
  // Create geometry for the item
  const geometry = new THREE.BoxGeometry(
    item.length,
    item.height,
    item.width
  );
  
  // Parse the color or use a default
  let color;
  try {
    color = new THREE.Color(item.color);
  } catch (e) {
    color = new THREE.Color(0x6366f1); // Default indigo color
  }
  
  // Create material with the item's color
  const material = new THREE.MeshLambertMaterial({
    color: color,
    transparent: true,
    opacity: 0.8
  });
  
  // Create mesh and position it
  const mesh = new THREE.Mesh(geometry, material);
  
  // Position the mesh based on the item's position
  // Add half the dimensions to center the box on its position
  mesh.position.set(
    item.position.x + item.length / 2,
    item.position.y + item.height / 2,
    item.position.z + item.width / 2
  );
  
  return mesh;
};

/**
 * Renders an orthographic view of the container and its packed items
 * @param container The container to render
 * @param packedItems The packed items to render
 * @param view The orthographic view to render (top, front, or side)
 * @param width The width of the rendered image
 * @param height The height of the rendered image
 * @returns A data URL of the rendered image
 */
export const renderOrthographicView = (
  container: Container,
  packedItems: PackedItem[],
  view: OrthographicView,
  width: number = 800,
  height: number = 600
): string => {
  // Create a scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  
  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(container.length, container.height, container.width);
  scene.add(directionalLight);
  
  // Add container mesh
  const containerMesh = createContainerMesh(container);
  scene.add(containerMesh);
  
  // Add packed items
  packedItems.forEach(item => {
    const itemMesh = createItemMesh(item);
    scene.add(itemMesh);
  });
  
  // Calculate the dimensions for the camera
  const maxDimension = Math.max(container.length, container.width, container.height) * 1.2;
  
  // Create an orthographic camera based on the view
  const camera = new THREE.OrthographicCamera(
    -maxDimension / 2,
    maxDimension / 2,
    maxDimension / 2,
    -maxDimension / 2,
    0.1,
    maxDimension * 2
  );
  
  // Position the camera based on the view
  switch (view) {
    case 'top':
      camera.position.set(container.length / 2, maxDimension, container.width / 2);
      camera.lookAt(container.length / 2, 0, container.width / 2);
      break;
    case 'front':
      camera.position.set(container.length / 2, container.height / 2, maxDimension);
      camera.lookAt(container.length / 2, container.height / 2, 0);
      break;
    case 'side':
      camera.position.set(maxDimension, container.height / 2, container.width / 2);
      camera.lookAt(0, container.height / 2, container.width / 2);
      break;
  }
  
  // Create a renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  
  // Render the scene
  renderer.render(scene, camera);
  
  // Get the data URL
  const dataUrl = renderer.domElement.toDataURL('image/png');
  
  // Clean up
  renderer.dispose();
  
  return dataUrl;
};

/**
 * Renders all orthographic views (top, front, side) of the container and its packed items
 * @param container The container to render
 * @param packedItems The packed items to render
 * @param width The width of each rendered image
 * @param height The height of each rendered image
 * @returns An object containing data URLs for each view
 */
export const renderAllOrthographicViews = (
  container: Container,
  packedItems: PackedItem[],
  width: number = 800,
  height: number = 600
): Record<OrthographicView, string> => {
  return {
    top: renderOrthographicView(container, packedItems, 'top', width, height),
    front: renderOrthographicView(container, packedItems, 'front', width, height),
    side: renderOrthographicView(container, packedItems, 'side', width, height)
  };
};
