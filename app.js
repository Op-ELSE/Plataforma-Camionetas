// Estado Global
let fleet = [{ id: 1, l: 3.0, w: 1.8, h: 1.5, cap: 1000, group: new THREE.Group() }];
let currentTruckIdx = 0;
let cargoItems = []; 
let activeLevelFilter = 'all';


// Elementos del DOM
const uploadBtn = document.getElementById('btn-upload');
const fileInput = document.getElementById('excel-upload');
const calculateBtn = document.getElementById('btn-calculate');
const cargoListEl = document.getElementById('cargo-list');
const statItems = document.getElementById('stat-items');
const statLoaded = document.getElementById('stat-loaded');
const statVol = document.getElementById('stat-vol');
const btnUpdateTruck = document.getElementById('btn-update-truck');
const btnResetCam = document.getElementById('btn-reset-cam');
const truckSelect = document.getElementById('truck-type');
const truckCapacityInput = document.getElementById('truck-capacity');
const statWeight = document.getElementById('stat-weight');
const weightWarning = document.getElementById('weight-warning');

// Elementos Flota
const btnPrevTruck = document.getElementById('btn-prev-truck');
const btnNextTruck = document.getElementById('btn-next-truck');
const btnAddTruck = document.getElementById('btn-add-truck');
const truckLabel = document.getElementById('truck-label');

// Variables Three.js
let scene, camera, renderer, controls, grid;
let truckMesh;
let dragControls;
let interactableMeshes = [];
let isDragging = false; // Estado para rastrear si se estÃ¡ arrastrando una caja
let isCutawayModeActive = false; // Vista 3D sÃ³lida siempre activa


// Raycaster para click derecho
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const contextMenu = document.getElementById('context-menu');
let selectedMesh = null;

// Modelos de Camionetas
const truckTemplates = {
    'hilux': { l: 1.52, w: 1.54, h: 0.48, cap: 1000 },
    'frontier': { l: 1.50, w: 1.56, h: 0.47, cap: 1000 },
    'f150': { l: 1.70, w: 1.28, h: 0.54, cap: 1200 },
    'pallet': { l: 1.20, w: 1.00, h: 1.60, cap: 1200 }
};

// InicializaciÃ³n
init3D();
setupEventListeners();
updateFleetUI();

function setupEventListeners() {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    calculateBtn.addEventListener('click', calculateLoad);
    
    const downloadBtn = document.getElementById('btn-download');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadReport);
    }
    btnUpdateTruck.addEventListener('click', () => {
        truckSelect.value = 'custom';
        updateTruckDimensions();
    });
    btnResetCam.addEventListener('click', () => {
        camera.position.set(6, 4, 7);
        controls.target.set(0, 0, 0);
    });
    
    truckSelect.addEventListener('change', (e) => {
        const type = e.target.value;
        updatePreviewImage(type);
        if (truckTemplates[type]) {
            document.getElementById('truck-length').value = truckTemplates[type].l;
            document.getElementById('truck-width').value = truckTemplates[type].w;
            document.getElementById('truck-height').value = truckTemplates[type].h;
            document.getElementById('truck-capacity').value = truckTemplates[type].cap || 1000;
            updateTruckDimensions();
        }
    });
    
    btnPrevTruck.addEventListener('click', () => switchTruck(-1));
    btnNextTruck.addEventListener('click', () => switchTruck(1));
    btnAddTruck.addEventListener('click', addTruck);
    
    // Event listeners para pestaÃ±as de niveles
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeLevelFilter = btn.getAttribute('data-level');
            renderCargoList();
        });
    });
    
    // Click derecho en el canvas
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        const rect = canvasContainer.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(interactableMeshes);
        
        if (intersects.length > 0) {
            showContextMenu(e, intersects[0].object);
        } else {
            contextMenu.style.display = 'none';
            selectedMesh = null;
        }
    });

    // Drag & Drop HTML a Canvas
    canvasContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    
    canvasContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        const itemId = e.dataTransfer.getData('text/plain');
        if (itemId) {
            handleHtmlDropOnCanvas(itemId, e.clientX, e.clientY);
        }
    });

    // Ocultar menÃº al hacer clic normal
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });

    // LÃ³gica para retirar caja
    document.getElementById('menu-remove').addEventListener('click', () => {
        if (selectedMesh) {
            removeMeshFromTruck(selectedMesh);
        }
    });
    
    // LÃ³gica para rotar caja desde clic derecho
    const menuRotate = document.getElementById('menu-rotate');
    if (menuRotate) {
        menuRotate.addEventListener('click', () => {
            if (selectedMesh) {
                rotateMesh(selectedMesh);
                contextMenu.style.display = 'none';
            }
        });
    }

    // Event listener para simular guardabarros en tiempo real
    const checkboxWheelWells = document.getElementById('truck-wheel-wells');
    if (checkboxWheelWells) {
        checkboxWheelWells.addEventListener('change', () => {
            createTruckVisual();
            recalculateAllHeights();
            updateStats();
        });
    }

    // (Modo Corte eliminado - vista 3D sÃ³lida siempre activa)
}

function addTruck() {
    const currentTruck = fleet[currentTruckIdx];
    const newId = fleet.length + 1;
    fleet.push({ 
        id: newId, 
        l: currentTruck.l, 
        w: currentTruck.w, 
        h: currentTruck.h, 
        cap: currentTruck.cap || 1000, 
        group: new THREE.Group() 
    });
    currentTruckIdx = fleet.length - 1;
    updateFleetUI();
}

function switchTruck(dir) {
    let newIdx = currentTruckIdx + dir;
    if (newIdx >= 0 && newIdx < fleet.length) {
        currentTruckIdx = newIdx;
        updateFleetUI();
    }
}

function updateFleetUI() {
    const t = fleet[currentTruckIdx];
    truckLabel.innerText = `Camioneta ${t.id}`;
    document.getElementById('truck-length').value = t.l;
    document.getElementById('truck-width').value = t.w;
    document.getElementById('truck-height').value = t.h;
    document.getElementById('truck-capacity').value = t.cap || 1000;
    
    // Auto-detectar tipo en base a las dimensiones para sincronizar dropdown e imagen
    let detectedType = 'custom';
    for (let key in truckTemplates) {
        if (Math.abs(truckTemplates[key].l - t.l) < 0.05 &&
            Math.abs(truckTemplates[key].w - t.w) < 0.05 &&
            Math.abs(truckTemplates[key].h - t.h) < 0.05) {
            detectedType = key;
            break;
        }
    }
    truckSelect.value = detectedType;
    updatePreviewImage(detectedType);
    
    // Remover de forma segura todos los grupos de camionetas del scene iterando en reversa
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const child = scene.children[i];
        if (child.type === 'Group') {
            scene.remove(child);
        }
    }
    scene.add(t.group);
    
    createTruckVisual();
    interactableMeshes = t.group.children.filter(m => m.type === 'Mesh');
    recalculateAllHeights(); // Estabilizar fÃ­sica y gravedad en la camioneta activa al cambiar
    initDragControls();
}

function updatePreviewImage(type) {
    const imgPreview = document.getElementById('img-truck-preview');
    if (imgPreview) {
        if (type === 'hilux') imgPreview.src = 'hilux_preview.png';
        else if (type === 'frontier') imgPreview.src = 'frontier_preview.png';
        else if (type === 'f150') imgPreview.src = 'f150_preview.png';
        else if (type === 'pallet') imgPreview.src = 'pallet_preview.png';
        else imgPreview.src = 'f150_preview.png'; // Fallback / Custom
    }
    updateCanvasBackground(type);
}
function updateCanvasBackground(type) {
    const canvasBg = document.getElementById('canvas-bg');
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasBg) {
        canvasBg.style.backgroundImage = 'none';
        canvasBg.classList.remove('visible');
    }
    if (!canvasContainer) return;

    if (isCutawayModeActive) {
        canvasContainer.classList.add('cutaway-mode');
        if (renderer) {
            renderer.setClearColor(0x000000, 0);
        }
    } else {
        canvasContainer.classList.remove('cutaway-mode');
        if (renderer) {
            renderer.setClearColor(0x000000, 0);
        }
    }
}


function init3D() {
    const container = document.getElementById('canvas-container');
    
    scene = new THREE.Scene();
    
    // CÃ¡mara
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(6, 4, 7);
    
    // Renderizador con alpha transparente para compositar sobre la imagen de fondo
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparente por defecto (Modo Corte)
    renderer.setSize(container.clientWidth, container.clientHeight);
    // Canvas por encima del canvas-bg
    renderer.domElement.style.position = 'relative';
    renderer.domElement.style.zIndex = '1';
    container.appendChild(renderer.domElement);
    
    // Controles Orbitales
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    
    // IluminaciÃ³n de estudio muy brillante y clara
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555555, 1.4);
    scene.add(hemiLight);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(8, 18, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.65);
    dirLight2.position.set(-10, 8, -8);
    scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0xffffff, 0.35);
    dirLight3.position.set(0, -4, 12);
    scene.add(dirLight3);

    // Grilla en el suelo (semi-transparente para el modo corte)
    grid = new THREE.GridHelper(20, 20, 0x888888, 0xaaaaaa);
    scene.add(grid);
    
    scene.add(fleet[0].group);

    createTruckVisual();

    // Responsive
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    animate();
}


function createTruckVisual() {
    if (truckMesh) scene.remove(truckMesh);
    
    const t = fleet[currentTruckIdx];
    const truckType = document.getElementById('truck-type')?.value || 'custom';
    
    // Crear truckMesh como grupo para contener todas las partes del modelo
    truckMesh = new THREE.Group();
    
    // FunciÃ³n auxiliar para aÃ±adir bordes definidos a las piezas 3D para evitar aspecto plano
    function addOutlines(mesh, outlineColor = 0x111111, opacity = 0.4) {
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
            color: outlineColor,
            transparent: true,
            opacity: opacity
        }));
        line.raycast = () => {};
        mesh.add(line);
    }
    
    // Colores de pintura claros y brillantes (estilo pintura de auto metÃ¡lica)
    let paintColor = 0x5dade2; // Azul celeste brillante
    if (truckType === 'hilux') paintColor = 0xff4d4d; // Rojo Hilux GR Sport
    else if (truckType === 'frontier') paintColor = 0xf1f2f6; // Gris plata metÃ¡lico claro
    else if (truckType === 'f150') paintColor = 0xc5cbd3; // Gris acero metÃ¡lico claro
    
    if (truckType === 'pallet') {
        // --- MODELADO DEL PALLET DE MADERA 3D DETALLADO ---
        const woodMat = new THREE.MeshPhongMaterial({
            color: 0xc8ad7f, // Tono madera natural cálido (no amarillo plano)
            shininess: 12,
            specular: 0x332211
        });
        
        const woodOutlineColor = 0x472f1c; // Bordes cafÃ©© oscuro
        
        // 1. Listones superiores (slats) corriendo a lo largo (X) - Espesor 0.028 (2.8cm)
        const slatCount = 5;
        const slatWidth = t.w * 0.15;
        const gap = (t.w - slatWidth * slatCount) / (slatCount - 1);
        for (let i = 0; i < slatCount; i++) {
            const slatGeo = new THREE.BoxGeometry(t.l, 0.028, slatWidth);
            const slatMesh = new THREE.Mesh(slatGeo, woodMat);
            slatMesh.position.set(0, -0.014, -t.w/2 + slatWidth/2 + i * (slatWidth + gap));
            addOutlines(slatMesh, woodOutlineColor, 0.75);
            truckMesh.add(slatMesh);
        }
        
        // 2. Tablas cruzadas intermedias (running along Z), espesor 0.028, ancho 0.12
        const crossWidth = 0.12;
        const crossPositions = [-t.l/2 + crossWidth/2 + 0.03, 0, t.l/2 - crossWidth/2 - 0.03];
        crossPositions.forEach(xPos => {
            const crossGeo = new THREE.BoxGeometry(crossWidth, 0.028, t.w);
            const crossMesh = new THREE.Mesh(crossGeo, woodMat);
            crossMesh.position.set(xPos, -0.042, 0);
            addOutlines(crossMesh, woodOutlineColor, 0.75);
            truckMesh.add(crossMesh);
        });
        
        // 3. Tacos/Bloques de madera (separadores)
        // Bloques robustos de 0.11 x 0.11 x 0.09 de alto
        const blockW = 0.11;
        const blockL = 0.11;
        const blockH = 0.09;
        const blockGeo = new THREE.BoxGeometry(blockL, blockH, blockW);
        const zPositions = [-t.w/2 + blockW/2 + 0.02, 0, t.w/2 - blockW/2 - 0.02];
        crossPositions.forEach(xPos => {
            zPositions.forEach(zPos => {
                const blockMesh = new THREE.Mesh(blockGeo, woodMat);
                blockMesh.position.set(xPos, -0.101, zPos);
                addOutlines(blockMesh, woodOutlineColor, 0.75);
                truckMesh.add(blockMesh);
            });
        });
        
        // 4. Tablas base inferiores corriendo a lo largo (X), espesor 0.028, ancho 0.12
        const bottomWidth = 0.12;
        const bottomPositions = [-t.w/2 + bottomWidth/2 + 0.02, 0, t.w/2 - bottomWidth/2 - 0.02];
        bottomPositions.forEach(zPos => {
            const bottomGeo = new THREE.BoxGeometry(t.l, 0.028, bottomWidth);
            const bottomMesh = new THREE.Mesh(bottomGeo, woodMat);
            bottomMesh.position.set(0, -0.16, zPos);
            addOutlines(bottomMesh, woodOutlineColor, 0.75);
            truckMesh.add(bottomMesh);
        });
        
        // 5. Envoltura del Ã¡rea Ãºtil de carga (visualizaciÃ³n semi-transparente verde)
        const envGeo = new THREE.BoxGeometry(t.l, t.h, t.w);
        const envMat = new THREE.MeshStandardMaterial({
            color: 0x2ea043,
            roughness: 0.5,
            metalness: 0.1,
            transparent: true,
            opacity: 0.1,
            depthWrite: false
        });
        const envMesh = new THREE.Mesh(envGeo, envMat);
        envMesh.position.set(0, t.h / 2, 0);
        truckMesh.add(envMesh);
        
        const envEdges = new THREE.EdgesGeometry(envGeo);
        const envLine = new THREE.LineSegments(envEdges, new THREE.LineBasicMaterial({
            color: 0x2ea043,
            linewidth: 2,
            transparent: true,
            opacity: 0.4
        }));
        envLine.position.set(0, t.h / 2, 0);
        truckMesh.add(envLine);
        
        // Mover la rejilla del suelo a la base inferior del pallet
        if (grid) grid.position.y = -0.174;
        
    } else {
        // --- MODELADO DE LA CAMIONETA 3D (TOLVA + VEHICULO COMPLETO) ---
        const R = Math.min(0.35, t.l * 0.23);
        const W = Math.min(0.28, t.w * 0.18);
        const Y_axle = -0.14;
        const Y_road = Y_axle - R;
        
        if (grid) grid.position.y = Y_road;
        
        const bodyPaintMat = new THREE.MeshPhongMaterial({
            color: paintColor,
            shininess: 140,
            specular: 0xffffff,
            transparent: isCutawayModeActive,
            opacity: isCutawayModeActive ? 0.22 : 1.0,
            depthWrite: !isCutawayModeActive
        });
        
        const chassisMat = new THREE.MeshPhongMaterial({
            color: 0x272b30,
            shininess: 35,
            specular: 0x444444,
            transparent: isCutawayModeActive,
            opacity: isCutawayModeActive ? 0.20 : 1.0,
            depthWrite: !isCutawayModeActive
        });
        
        const bedlinerMat = new THREE.MeshPhongMaterial({
            color: 0x3a3f44,
            shininess: 30,
            specular: 0x666666,
            transparent: isCutawayModeActive,
            opacity: isCutawayModeActive ? 0.45 : 1.0,
            depthWrite: !isCutawayModeActive
        });
        
        // En Modo Corte las paredes son mas transparentes para ver las cajas
        const wallOpacity = isCutawayModeActive ? 0.18 : 0.50;
        const bedWallMat = new THREE.MeshPhongMaterial({
            color: paintColor,
            shininess: 80,
            specular: 0xffffff,
            transparent: true,
            opacity: wallOpacity,
            depthWrite: false
        });
        
        const plasticMat = new THREE.MeshPhongMaterial({
            color: 0x1a1a1a,
            shininess: 15,
            specular: 0x333333,
            transparent: isCutawayModeActive,
            opacity: isCutawayModeActive ? 0.20 : 1.0,
            depthWrite: !isCutawayModeActive
        });

        const glassMat = new THREE.MeshPhongMaterial({
            color: 0x111111,
            shininess: 180,
            specular: 0xffffff,
            transparent: true,
            opacity: isCutawayModeActive ? 0.15 : 0.75,
            depthWrite: !isCutawayModeActive
        });

        const chromeMat = new THREE.MeshPhongMaterial({
            color: 0xeeeeee,
            shininess: 200,
            specular: 0xffffff,
            transparent: isCutawayModeActive,
            opacity: isCutawayModeActive ? 0.25 : 1.0,
            depthWrite: !isCutawayModeActive
        });

        // ---- TOLVA DE CARGA (visible en ambos modos) ----
        const floorGeo = new THREE.BoxGeometry(t.l, 0.025, t.w);
        const floorMesh = new THREE.Mesh(floorGeo, bedlinerMat);
        floorMesh.position.set(0, -0.012, 0);
        addOutlines(floorMesh, 0x222222, 0.5);
        truckMesh.add(floorMesh);
        
        // Costillas acanaladas del piso
        const ribCount = 7;
        const ribW = 0.022;
        const ribL = t.l - 0.04;
        const ribGap = (t.w * 0.82 - ribW * ribCount) / (ribCount - 1);
        for (let i = 0; i < ribCount; i++) {
            const ribGeo = new THREE.BoxGeometry(ribL, 0.008, ribW);
            const ribMesh = new THREE.Mesh(ribGeo, plasticMat);
            ribMesh.position.set(0, 0.004, -t.w * 0.41 + ribW/2 + i * (ribW + ribGap));
            truckMesh.add(ribMesh);
        }
        
        // Pared lateral izquierda
        const leftWallGeo = new THREE.BoxGeometry(t.l, t.h, 0.022);
        const leftWallMesh = new THREE.Mesh(leftWallGeo, bedWallMat);
        leftWallMesh.position.set(0, t.h / 2, -t.w/2 - 0.011);
        addOutlines(leftWallMesh, 0x111111, 0.4);
        truckMesh.add(leftWallMesh);
        
        // Pared lateral derecha
        const rightWallMesh = new THREE.Mesh(leftWallGeo, bedWallMat);
        rightWallMesh.position.set(0, t.h / 2, t.w/2 + 0.011);
        addOutlines(rightWallMesh, 0x111111, 0.4);
        truckMesh.add(rightWallMesh);
        
        // Pared frontal (detras de la cabina)
        const frontWallGeo = new THREE.BoxGeometry(0.022, t.h, t.w);
        const frontWallMesh = new THREE.Mesh(frontWallGeo, bedWallMat);
        frontWallMesh.position.set(t.l / 2 + 0.011, t.h / 2, 0);
        addOutlines(frontWallMesh, 0x111111, 0.35);
        truckMesh.add(frontWallMesh);
        
        // Tailgate
        const tailgateMesh = new THREE.Mesh(frontWallGeo, bedWallMat);
        tailgateMesh.position.set(-t.l / 2 - 0.011, t.h / 2, 0);
        addOutlines(tailgateMesh, 0x111111, 0.4);
        truckMesh.add(tailgateMesh);
        
        // Bed rails
        const railWidth = 0.032;
        const railHeight = 0.022;
        const leftRailGeo = new THREE.BoxGeometry(t.l + 0.045, railHeight, railWidth);
        const leftRailMesh = new THREE.Mesh(leftRailGeo, bodyPaintMat);
        leftRailMesh.position.set(0, t.h + railHeight/2, -t.w/2 - 0.011);
        addOutlines(leftRailMesh, 0x111111, 0.45);
        truckMesh.add(leftRailMesh);
        
        const rightRailMesh = new THREE.Mesh(leftRailGeo, bodyPaintMat);
        rightRailMesh.position.set(0, t.h + railHeight/2, t.w/2 + 0.011);
        addOutlines(rightRailMesh, 0x111111, 0.45);
        truckMesh.add(rightRailMesh);
        
        const backRailGeo = new THREE.BoxGeometry(railWidth, railHeight, t.w + 0.045);
        const backRailMesh = new THREE.Mesh(backRailGeo, bodyPaintMat);
        backRailMesh.position.set(-t.l/2 - 0.011, t.h + railHeight/2, 0);
        addOutlines(backRailMesh, 0x111111, 0.45);
        truckMesh.add(backRailMesh);
        
        // Wireframe luminoso de la tolva
        const bedEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(t.l, t.h, t.w));
        const bedWire = new THREE.LineSegments(bedEdges, new THREE.LineBasicMaterial({
            color: paintColor,
            linewidth: 2,
            transparent: true,
            opacity: isCutawayModeActive ? 0.85 : 0.55
        }));
        bedWire.position.set(0, t.h / 2, 0);
        truckMesh.add(bedWire);

        // ---- VEHICULO COMPLETO ----
        { // Renderizar siempre el vehÃ­culo completo
            const cabLength = 1.15;
            const hoodLength = 0.80;
            const cabWidth = t.w + 0.04;

            // Chasis
            const totalLength = t.l + cabLength + hoodLength + 0.05;
            const chassisGeo = new THREE.BoxGeometry(totalLength, 0.08, t.w * 0.65);
            const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
            chassisMesh.position.set((cabLength + hoodLength) / 2, Y_axle + 0.04, 0);
            addOutlines(chassisMesh, 0x111111, 0.3);
            truckMesh.add(chassisMesh);
            
            // Cabina inferior
            const lowerCabHeight = t.h + 0.20;
            const lowerCabGeo = new THREE.BoxGeometry(cabLength, lowerCabHeight, cabWidth);
            const lowerCabMesh = new THREE.Mesh(lowerCabGeo, bodyPaintMat);
            lowerCabMesh.position.set(t.l/2 + cabLength/2, lowerCabHeight/2 - 0.15, 0);
            addOutlines(lowerCabMesh, 0x111111, 0.45);
            truckMesh.add(lowerCabMesh);
            
            // Techo y vidrios (Cabina Tapered / AerodinÃ¡mica de pickup real)
            const upperCabHeight = 0.45;
            const upperCabGeo = new THREE.CylinderGeometry(0.72 / Math.sqrt(2), 1.0 / Math.sqrt(2), upperCabHeight, 4);
            upperCabGeo.rotateY(Math.PI / 4); // Alinear caras
            upperCabGeo.scale(cabLength, 1, cabWidth * 0.85); // Escalar al tamaÃ±o de cabina
            const upperCabMesh = new THREE.Mesh(upperCabGeo, glassMat);
            upperCabMesh.position.set(t.l/2 + cabLength/2, t.h + 0.05 + upperCabHeight/2, 0);
            addOutlines(upperCabMesh, 0x000000, 0.5);
            truckMesh.add(upperCabMesh);
            
            // Techo metÃ¡lico adaptado a la forma cÃ³nica
            const roofGeo = new THREE.BoxGeometry(cabLength * 0.72, 0.02, cabWidth * 0.85 * 0.72);
            const roofMesh = new THREE.Mesh(roofGeo, bodyPaintMat);
            roofMesh.position.set(t.l/2 + cabLength/2, t.h + 0.05 + upperCabHeight + 0.01, 0);
            addOutlines(roofMesh, 0x111111, 0.45);
            truckMesh.add(roofMesh);
            
            // Pilar C trasero adaptado
            const rearPillarGeo = new THREE.BoxGeometry(0.18, upperCabHeight, cabWidth * 0.85 * 0.85);
            const rearPillarMesh = new THREE.Mesh(rearPillarGeo, bodyPaintMat);
            rearPillarMesh.position.set(t.l/2 + 0.09, t.h + 0.05 + upperCabHeight/2, 0);
            addOutlines(rearPillarMesh, 0x111111, 0.4);
            truckMesh.add(rearPillarMesh);
            
            // Capo inclinado y redondeado
            const hoodHeight = t.h + 0.08;
            const hoodGeo = new THREE.BoxGeometry(hoodLength, hoodHeight, cabWidth);
            const hoodMesh = new THREE.Mesh(hoodGeo, bodyPaintMat);
            hoodMesh.rotation.z = -0.05;
            hoodMesh.position.set(t.l/2 + cabLength + hoodLength/2, (hoodHeight/2 - 0.15) - 0.02, 0);
            addOutlines(hoodMesh, 0x111111, 0.45);
            truckMesh.add(hoodMesh);
            
            // Grille
            const grilleGeo = new THREE.BoxGeometry(0.03, t.h * 0.4, cabWidth * 0.7);
            const grilleMesh = new THREE.Mesh(grilleGeo, plasticMat);
            grilleMesh.position.set(t.l/2 + cabLength + hoodLength - 0.01, t.h * 0.18 - 0.1, 0);
            addOutlines(grilleMesh, 0x000000, 0.5);
            truckMesh.add(grilleMesh);

            const logoGeo = new THREE.BoxGeometry(0.02, 0.04, cabWidth * 0.25);
            const logoMesh = new THREE.Mesh(logoGeo, chromeMat);
            logoMesh.position.set(t.l/2 + cabLength + hoodLength, t.h * 0.18 - 0.1, 0);
            truckMesh.add(logoMesh);
            
            // Faros delanteros
            const headlightGeo = new THREE.BoxGeometry(0.02, 0.07, 0.15);
            const headlightMat = new THREE.MeshPhongMaterial({
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveIntensity: isCutawayModeActive ? 0.35 : 1.5,
                shininess: 100,
                transparent: isCutawayModeActive,
                opacity: isCutawayModeActive ? 0.30 : 1.0
            });
            const leftHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
            leftHeadlight.position.set(t.l/2 + cabLength + hoodLength - 0.02, t.h * 0.20 - 0.08, -cabWidth * 0.38);
            addOutlines(leftHeadlight, 0x000000, 0.3);
            truckMesh.add(leftHeadlight);
            const rightHeadlight = leftHeadlight.clone();
            rightHeadlight.position.z = cabWidth * 0.38;
            truckMesh.add(rightHeadlight);
            
            // Parachoques
            const bumperGeo = new THREE.BoxGeometry(0.1, 0.18, cabWidth * 1.02);
            const bumperMesh = new THREE.Mesh(bumperGeo, plasticMat);
            bumperMesh.position.set(t.l/2 + cabLength + hoodLength + 0.02, -0.12, 0);
            addOutlines(bumperMesh, 0x111111, 0.4);
            truckMesh.add(bumperMesh);

            const skidGeo = new THREE.BoxGeometry(0.08, 0.06, cabWidth * 0.4);
            const skidMesh = new THREE.Mesh(skidGeo, chromeMat);
            skidMesh.position.set(t.l/2 + cabLength + hoodLength + 0.03, -0.16, 0);
            addOutlines(skidMesh, 0x222222, 0.4);
            truckMesh.add(skidMesh);
            
            // Espejos
            const mirrorGeo = new THREE.BoxGeometry(0.06, 0.08, 0.12);
            const leftMirror = new THREE.Mesh(mirrorGeo, plasticMat);
            leftMirror.position.set(t.l/2 + 0.4, t.h + 0.25, -cabWidth * 0.5 - 0.05);
            addOutlines(leftMirror, 0x000000, 0.4);
            truckMesh.add(leftMirror);
            const rightMirror = leftMirror.clone();
            rightMirror.position.z = cabWidth * 0.5 + 0.05;
            truckMesh.add(rightMirror);
            
            // Faros traseros
            const taillightGeo = new THREE.BoxGeometry(0.02, 0.14, 0.03);
            const taillightMat = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: isCutawayModeActive ? 0.20 : 0.8,
                shininess: 80,
                transparent: isCutawayModeActive,
                opacity: isCutawayModeActive ? 0.30 : 1.0
            });
            const leftTaillight = new THREE.Mesh(taillightGeo, taillightMat);
            leftTaillight.position.set(-t.l/2 - 0.02, t.h * 0.5 - 0.04, -t.w/2 - 0.005);
            addOutlines(leftTaillight, 0x330000, 0.4);
            truckMesh.add(leftTaillight);
            const rightTaillight = leftTaillight.clone();
            rightTaillight.position.z = t.w/2 + 0.005;
            truckMesh.add(rightTaillight);
            
            // Ruedas
            function makeWheel(radius, width) {
                const wheelGrp = new THREE.Group();
                const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 24);
                tireGeo.rotateX(Math.PI / 2);
                const tireMat2 = new THREE.MeshPhongMaterial({
                    color: 0x191919,
                    shininess: 10,
                    specular: 0x222222,
                    transparent: isCutawayModeActive,
                    opacity: isCutawayModeActive ? 0.30 : 1.0,
                    depthWrite: !isCutawayModeActive
                });
                const tireMesh2 = new THREE.Mesh(tireGeo, tireMat2);
                addOutlines(tireMesh2, 0x000000, 0.35);
                wheelGrp.add(tireMesh2);
                const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.01, 16);
                rimGeo.rotateX(Math.PI / 2);
                const rimMat2 = new THREE.MeshPhongMaterial({
                    color: 0xeeeeee,
                    shininess: 180,
                    specular: 0xffffff,
                    transparent: isCutawayModeActive,
                    opacity: isCutawayModeActive ? 0.30 : 1.0,
                    depthWrite: !isCutawayModeActive
                });
                const rimMesh2 = new THREE.Mesh(rimGeo, rimMat2);
                addOutlines(rimMesh2, 0x333333, 0.4);
                wheelGrp.add(rimMesh2);
                const capGeo = new THREE.CylinderGeometry(radius * 0.15, radius * 0.15, width + 0.02, 8);
                capGeo.rotateX(Math.PI / 2);
                const capMat2 = new THREE.MeshPhongMaterial({
                    color: 0x2d2d2d,
                    shininess: 50,
                    specular: 0x666666,
                    transparent: isCutawayModeActive,
                    opacity: isCutawayModeActive ? 0.30 : 1.0,
                    depthWrite: !isCutawayModeActive
                });
                const capMesh2 = new THREE.Mesh(capGeo, capMat2);
                wheelGrp.add(capMesh2);
                return wheelGrp;
            }
            
            const leftRearWheel = makeWheel(R, W);
            leftRearWheel.position.set(-t.l/2 + R + 0.05, Y_axle, -t.w/2 - W/2);
            truckMesh.add(leftRearWheel);
            const rightRearWheel = makeWheel(R, W);
            rightRearWheel.position.set(-t.l/2 + R + 0.05, Y_axle, t.w/2 + W/2);
            truckMesh.add(rightRearWheel);
            const leftFrontWheel = makeWheel(R, W);
            leftFrontWheel.position.set(t.l/2 + cabLength + 0.1, Y_axle, -t.w/2 - W/2);
            truckMesh.add(leftFrontWheel);
            const rightFrontWheel = makeWheel(R, W);
            rightFrontWheel.position.set(t.l/2 + cabLength + 0.1, Y_axle, t.w/2 + W/2);
            truckMesh.add(rightFrontWheel);
            
            // Fender flares
            const flareGeo = new THREE.TorusGeometry(R * 1.1, 0.02, 8, 24, Math.PI);
            const leftRearFlare = new THREE.Mesh(flareGeo, plasticMat);
            leftRearFlare.position.set(-t.l/2 + R + 0.05, Y_axle, -t.w/2 - 0.015);
            addOutlines(leftRearFlare, 0x000000, 0.4);
            truckMesh.add(leftRearFlare);
            const rightRearFlare = leftRearFlare.clone();
            rightRearFlare.position.z = t.w/2 + 0.015;
            truckMesh.add(rightRearFlare);
            const leftFrontFlare = new THREE.Mesh(flareGeo, plasticMat);
            leftFrontFlare.position.set(t.l/2 + cabLength + 0.1, Y_axle, -cabWidth/2 - 0.01);
            addOutlines(leftFrontFlare, 0x000000, 0.4);
            truckMesh.add(leftFrontFlare);
            const rightFrontFlare = leftFrontFlare.clone();
            rightFrontFlare.position.z = cabWidth/2 + 0.01;
            truckMesh.add(rightFrontFlare);

            // Estribos cromados
            const stepGeo = new THREE.BoxGeometry(cabLength * 0.85, 0.02, 0.06);
            const leftStep = new THREE.Mesh(stepGeo, chromeMat);
            leftStep.position.set(t.l/2 + cabLength/2, Y_axle + 0.12, -cabWidth/2 - 0.025);
            addOutlines(leftStep, 0x222222, 0.4);
            truckMesh.add(leftStep);
            const rightStep = leftStep.clone();
            rightStep.position.z = cabWidth/2 + 0.025;
            truckMesh.add(rightStep);

            // Roll bar sport
            const barPlateGeo = new THREE.BoxGeometry(0.35, 0.50, 0.03);
            const leftBarPlate = new THREE.Mesh(barPlateGeo, plasticMat);
            leftBarPlate.rotation.z = -0.55;
            leftBarPlate.position.set(t.l/2 - 0.14, t.h + 0.22, -t.w/2 + 0.06);
            addOutlines(leftBarPlate, 0x000000, 0.45);
            truckMesh.add(leftBarPlate);
            const rightBarPlate = leftBarPlate.clone();
            rightBarPlate.position.z = t.w/2 - 0.06;
            truckMesh.add(rightBarPlate);

            const crossTubeGeo = new THREE.CylinderGeometry(0.02, 0.02, t.w - 0.16, 16);
            crossTubeGeo.rotateX(Math.PI / 2);
            const crossTube = new THREE.Mesh(crossTubeGeo, plasticMat);
            crossTube.position.set(t.l/2 - 0.02, t.h + 0.45, 0);
            addOutlines(crossTube, 0x000000, 0.4);
            truckMesh.add(crossTube);
        }
    }

    
    // Centramos la camioneta en el origen (X,Z) para que aparezca en el centro del canvas
    const bbox = new THREE.Box3().setFromObject(truckMesh);
    const cent = bbox.getCenter(new THREE.Vector3());
    truckMesh.position.x -= cent.x;
    truckMesh.position.z -= cent.z;
    scene.add(truckMesh);
    
    // Intentar cargar modelo 3D real si no es un pallet
    if (truckType !== 'pallet') {
        loadTruckModel(truckType, truckMesh, t);
    }
    
    // RENDERIZAR LOS GUÃABARROS (WHEEL WELLS) - Solo si hay guardabarros definidos
    // Remover guardabarros existentes en la escena
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const child = scene.children[i];
        if (child.userData && child.userData.isWheelWell) {
            scene.remove(child);
        }
    }
    
    const wells = getWheelWells(t);
    wells.forEach(well => {
        const wheelGeo = new THREE.CylinderGeometry(well.radius, well.radius, well.width, 32);
        wheelGeo.rotateX(Math.PI / 2);

        // Material del color del bedliner para simular el tapabarros real
        const wheelMat = new THREE.MeshPhongMaterial({
            color: 0x3a3f44,
            shininess: 20,
            specular: 0x555555,
            transparent: true,
            opacity: isCutawayModeActive ? 0.30 : 0.95,
            depthWrite: !isCutawayModeActive
        });

        const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
        const wheelEdges = new THREE.EdgesGeometry(wheelGeo);
        const wheelLine = new THREE.LineSegments(wheelEdges, new THREE.LineBasicMaterial({
            color: 0x111111,
            transparent: true,
            opacity: isCutawayModeActive ? 0.35 : 0.70
        }));
        wheelMesh.add(wheelLine);

        const posX = (well.minX + well.maxX) / 2;
        const posY = 0; // Ubicado al nivel del piso de la tolva (crea una media llanta en el piso)
        const posZ = (well.minZ + well.maxZ) / 2;
        wheelMesh.position.set(posX, posY, posZ);
        wheelMesh.userData.isWheelWell = true;

        scene.add(wheelMesh);
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function updateTruckDimensions() {
    const l = parseFloat(document.getElementById('truck-length').value);
    const w = parseFloat(document.getElementById('truck-width').value);
    const h = parseFloat(document.getElementById('truck-height').value);
    const cap = parseFloat(document.getElementById('truck-capacity').value);
    
    if(l > 0 && w > 0 && h > 0 && cap > 0) {
        fleet[currentTruckIdx].l = l;
        fleet[currentTruckIdx].w = w;
        fleet[currentTruckIdx].h = h;
        fleet[currentTruckIdx].cap = cap;
        createTruckVisual();
        updateStats();
    }
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Usar la primera hoja
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convertir a 2D Array para procesamiento robusto
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            parseExcelData(rawData);
            
            // Resetear input
            fileInput.value = '';
        } catch (err) {
            alert("Error al leer el arcÃ¡lido.");
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

let guideInfo = null;

function parseExcelData(sheetData) {
    cargoItems = [];
    guideInfo = null;
    
    // Ocultar paneles iniciales
    document.getElementById('guide-info-panel').style.display = 'none';
    document.getElementById('weight-warning').style.display = 'none';

    if (!sheetData || sheetData.length === 0) {
        alert("El archivo estÃ¡ vacÃ­o.");
        return;
    }

    // 1. Detectar si es un formato de GuÃ­a de RemisiÃ³n ElectrÃ³nica
    let isGuia = false;
    let headerRowIdx = -1;
    
    for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (!row) continue;
        
        const hasCodigo = row.some(cell => cell && cell.toString().toUpperCase().includes("CÓDIGO DEL MATERIAL"));
        const hasDescripcion = row.some(cell => cell && cell.toString().toUpperCase().includes("DESCRIPCIÓN"));
        const hasLargo = row.some(cell => cell && cell.toString().toUpperCase().includes("LARGO"));
        const hasAncho = row.some(cell => cell && cell.toString().toUpperCase().includes("ANCHO"));
        
        if (hasCodigo || (hasLargo && hasAncho)) {
            headerRowIdx = i;
            isGuia = hasCodigo;
            break;
        }
    }

    if (headerRowIdx === -1) {
        headerRowIdx = 0;
    }

    // 2. Extraer metadatos si es una GuÃ­a de RemisiÃ³n
    if (isGuia) {
        guideInfo = {
            nroGuia: "",
            destinatario: "",
            rucDestinatario: "",
            conductor: "",
            placa: "",
            partida: "",
            entrega: "",
            pesoTotal: 0,
            totalBultos: 0
        };

        let currentSection = "";

        for (let i = 0; i < headerRowIdx; i++) {
            const row = sheetData[i];
            if (!row) continue;

            const rowStr = row.join(" ").toUpperCase();
            if (rowStr.includes("GUÃA DE REMISIÃ“N") || rowStr.includes("GUÃA DE REMISIÃ“N")) {
                const nextRow = sheetData[i + 1];
                if (nextRow && nextRow[0]) {
                    guideInfo.nroGuia = nextRow[0].toString().trim();
                }
            }

            for (let j = 0; j < row.length; j++) {
                const cellVal = row[j] ? row[j].toString().trim() : "";
                const cellUpper = cellVal.toUpperCase();
                
                if (cellUpper.includes("PLACA DEL VEHICULO") || cellUpper.includes("PLACA")) {
                    guideInfo.placa = (row[j + 1] || "").toString().trim();
                }
                if (cellUpper.includes("NOMBRE DEL CONDUCTOR") || cellUpper.includes("CONDUCTOR")) {
                    guideInfo.conductor = (row[j + 1] || "").toString().trim();
                }
                if (cellUpper.includes("RAZÃ“N SOCIAL") || cellUpper.includes("RAZÃ“N SOCIAL")) {
                    guideInfo.destinatario = (row[j + 1] || "").toString().trim();
                }
                if (cellUpper.includes("RUC")) {
                    guideInfo.rucDestinatario = (row[j + 1] || "").toString().trim();
                }
                if (cellUpper.includes("PESO TOTAL")) {
                    guideInfo.pesoTotal = parseFloat(row[j + 1]) || 0;
                }
                if (cellUpper.includes("TOTAL DE BULTOS")) {
                    guideInfo.totalBultos = parseInt(row[j + 1]) || 0;
                }
            }

            if (rowStr.includes("PUNTO DE PARTIDA")) {
                currentSection = "PARTIDA";
            } else if (rowStr.includes("PUNTO DE ENTREGA")) {
                currentSection = "ENTREGA";
            }

            if (row.some(cell => cell && cell.toString().toUpperCase().includes("DIRECCIÃ“N"))) {
                const dirValIdx = row.findIndex(cell => cell && cell.toString().toUpperCase().includes("DIRECCIÃ“N")) + 1;
                const dirVal = (row[dirValIdx] || "").toString().trim();
                if (currentSection === "PARTIDA") {
                    guideInfo.partida = dirVal;
                } else if (currentSection === "ENTREGA") {
                    guideInfo.entrega = dirVal;
                }
            }
        }
        
        displayGuideInfo(guideInfo);
    }

    // 3. Mapear columnas de la fila de cabecera
    const headerRow = sheetData[headerRowIdx];
    let idxCodigo = -1;
    let idxDescripcion = -1;
    let idxUnidad = -1;
    let idxCantidad = -1;
    let idxPeso = -1;
    let idxLargo = -1;
    let idxProfundidad = -1;
    let idxAlto = -1;
    let idxApilamiento = -1;

    headerRow.forEach((cell, idx) => {
        if (!cell) return;
        const cellUpper = cell.toString().toUpperCase().trim();

        if (cellUpper.includes("CÃ“DIGO DEL MATERIAL") || cellUpper.includes("CÃ“DIGO DEL MATERIAL") || cellUpper.includes("CODIGO")) {
            idxCodigo = idx;
        } else if (cellUpper.includes("DESCRIPCIÃ“N") || cellUpper.includes("DESCRIPCIÃ“N") || cellUpper.includes("NOMBRE") || cellUpper.includes("NAME")) {
            idxDescripcion = idx;
        } else if (cellUpper.includes("UNIDAD")) {
            idxUnidad = idx;
        } else if (cellUpper.includes("CANTIDAD") || cellUpper.includes("CANT") || cellUpper.includes("QUANTITY")) {
            idxCantidad = idx;
        } else if (cellUpper.includes("PESO") || cellUpper.includes("WEIGHT")) {
            idxPeso = idx;
        } else if (cellUpper.includes("LARGO") || cellUpper.includes("LENGTH") || cellUpper === "L") {
            idxLargo = idx;
        } else if (cellUpper.includes("PROFUNDIDAD") || cellUpper.includes("ANCHO") || cellUpper.includes("WIDTH") || cellUpper === "W" || cellUpper === "A") {
            idxProfundidad = idx;
        } else if (cellUpper.includes("ALTO") || cellUpper.includes("ALTURA") || cellUpper.includes("HEIGHT") || cellUpper === "H") {
            idxAlto = idx;
        } else if (cellUpper.includes("APILAMIENTO") || cellUpper.includes("NIVEL") || cellUpper.includes("STACKING")) {
            idxApilamiento = idx;
        }
    });

    // Fallbacks
    if (idxDescripcion === -1) idxDescripcion = idxCodigo !== -1 ? idxCodigo : 0;
    if (idxLargo === -1) idxLargo = 1;
    if (idxProfundidad === -1) idxProfundidad = 2;
    if (idxAlto === -1) idxAlto = 3;
    if (idxCantidad === -1) idxCantidad = 4;
    if (idxApilamiento === -1) idxApilamiento = 5;

    // 4. Parsear las filas de datos
    for (let i = headerRowIdx + 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (!row || row.length === 0) continue;

        const rowDesc = row[idxDescripcion];
        const rowCod = idxCodigo !== -1 ? row[idxCodigo] : "";
        if (!rowDesc && !rowCod) continue;
        
        const firstCellStr = (row[0] || "").toString().toUpperCase();
        if (firstCellStr.includes("PESO TOTAL") || firstCellStr.includes("TOTAL DE BULTOS") || firstCellStr.includes("MATERIALES")) {
            continue;
        }

        const qtyVal = row[idxCantidad];
        const qty = parseInt(qtyVal) || 1;
        
        const pesoVal = idxPeso !== -1 ? parseFloat(row[idxPeso]) : 0;
        const pesoIndividual = isNaN(pesoVal) ? 0 : pesoVal;

        const largoVal = parseFloat(row[idxLargo]);
        const largo = isNaN(largoVal) ? 0.5 : largoVal;

        const profVal = parseFloat(row[idxProfundidad]);
        const profundidad = isNaN(profVal) ? 0.5 : profVal;

        const altoVal = parseFloat(row[idxAlto]);
        const alto = isNaN(altoVal) ? 0.5 : altoVal;

        let api = 1;
        if (idxApilamiento !== -1 && row[idxApilamiento] !== undefined) {
            const parsedApi = parseInt(row[idxApilamiento]);
            if (!isNaN(parsedApi)) {
                api = parsedApi;
            }
        }
        if (api < 0) api = 0;
        if (api > 3) api = 3;

        let color = '#2ea043'; // Verde
        if (api === 0) color = '#8b5cf6'; // Violeta/Morado
        if (api === 2) color = '#f1c40f'; // Amarillo
        if (api === 3) color = '#e74c3c'; // Rojo

        let name = "";
        const descText = rowDesc ? rowDesc.toString().trim() : "";
        const codText = rowCod ? rowCod.toString().trim() : "";
        if (codText && descText && codText !== descText) {
            name = `${codText} (${descText})`;
        } else {
            name = descText || codText || `Caja ${i - headerRowIdx}`;
        }

        for (let j = 0; j < qty; j++) {
            cargoItems.push({
                id: `Item-${i}-${j}`,
                name: name,
                codigo: codText,
                descripcion: descText,
                l: largo,
                w: profundidad,
                h: alto,
                peso: pesoIndividual,
                unidad: idxUnidad !== -1 ? (row[idxUnidad] || "Pz").toString().trim() : "Pz",
                apilamiento: api,
                color: color,
                truckId: null
            });
        }
    }

    renderCargoList();
    statItems.innerText = cargoItems.length;
    updateStats();
}

function displayGuideInfo(info) {
    const panel = document.getElementById('guide-info-panel');
    if (!info) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="guide-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(9, 105, 218, 0.2); padding-bottom:5px;">
            <span style="font-weight:bold; color:var(--accent-blue); font-size:0.85rem;">ðŸ“„ GUÃA DE REMISIÃ“N</span>
            <span style="font-family:monospace; font-weight:bold; background:#0969da; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${info.nroGuia || 'S/N'}</span>
        </div>
        <div class="guide-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:6px 10px; font-size:0.75rem; color:var(--text-primary);">
            <div style="grid-column: span 2;"><strong>Destinatario:</strong><br><span style="color:var(--text-secondary);">${info.destinatario || 'No especificado'}</span></div>
            <div><strong>Conductor:</strong><br><span style="color:var(--text-secondary);">${info.conductor || 'No especificado'}</span></div>
            <div><strong>Placa:</strong><br><span style="color:var(--text-secondary); font-weight:bold; background:#f0f2f5; padding:1px 4px; border-radius:3px;">${info.placa || 'No especificado'}</span></div>
            <div style="grid-column: span 2;"><strong>Punto de Entrega:</strong><br><span style="color:var(--text-secondary);">${info.entrega || 'No especificado'}</span></div>
            <div><strong>Bultos Declarados:</strong><br><span style="color:var(--text-secondary);">${info.totalBultos || '0'} pz</span></div>
            <div><strong>Peso Total Decl.:</strong><br><span style="color:var(--text-secondary);">${info.pesoTotal || '0'} kg</span></div>
        </div>
    `;
}

function renderCargoList() {
    cargoListEl.innerHTML = '';
    if (cargoItems.length === 0) {
        cargoListEl.innerHTML = '<p class="empty-msg">Sube un Excel para ver la lista de cajas aquÃ­.</p>';
        return;
    }
    
    // Filtrar los elementos segÃºn la pestaÃ±a activa
    const filteredItems = cargoItems.filter(item => {
        if (activeLevelFilter === 'all') return true;
        return item.apilamiento === parseInt(activeLevelFilter);
    });
    
    if (filteredItems.length === 0) {
        cargoListEl.innerHTML = `<p class="empty-msg">No hay cajas de Nivel ${activeLevelFilter} en la lista.</p>`;
        return;
    }
    
    filteredItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cargo-item';
        div.style.borderLeftColor = item.color;
        
        // Habilitar arrastre HTML para items que no estÃ¡¡n en la camioneta
        if (!item.truckId) {
            div.setAttribute('draggable', 'true');
            div.style.cursor = 'grab';
            
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.id);
                e.dataTransfer.effectAllowed = 'move';
                div.style.opacity = '0.5';
            });
            
            div.addEventListener('dragend', () => {
                div.style.opacity = '1.0';
            });
        }
        
        let statusHtml = item.truckId 
            ? `<span class="status-tag status-loaded">En Camioneta ${item.truckId}</span>` 
            : `<span class="status-tag status-missing">Falta cargar</span>`;
            
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <strong>${item.name}</strong>
                ${statusHtml}
            </div>
            <div class="item-details" style="display:grid; grid-template-columns:1fr 1fr; gap:2px; font-size:0.75rem; color:var(--text-secondary); margin-top:5px;">
                <span>Dim: ${item.l} x ${item.w} x ${item.h} m</span>
                <span>Apilamiento: Nv ${item.apilamiento}</span>
                ${item.peso ? `<span>Peso: ${item.peso} kg</span>` : ''}
                ${item.unidad ? `<span>Unidad: ${item.unidad}</span>` : ''}
            </div>
        `;
        cargoListEl.appendChild(div);
    });
}

function getRandomColor() {
    const letters = '6789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 10)];
    }
    return color;
}

function clearBoxes() {
    const group = fleet[currentTruckIdx].group;
    while(group.children.length > 0){ 
        const obj = group.children[0];
        if (obj.userData.itemId) {
            const item = cargoItems.find(i => i.id === obj.userData.itemId);
            if (item) item.truckId = null;
        }
        group.remove(obj); 
    }
    interactableMeshes = [];
    if (dragControls) dragControls.dispose();
    renderCargoList();
    updateStats();
}

function getWheelWells(t) {
    const truck = t || fleet[currentTruckIdx];
    if (!truck) return [];
    
    // Si es pallet, no simular pasos de rueda (guardabarros)
    const truckTypeSelect = document.getElementById('truck-type');
    if (truckTypeSelect && truckTypeSelect.value === 'pallet') {
        return [];
    }
    
    const enabled = document.getElementById('truck-wheel-wells')?.checked ?? true;
    if (!enabled) return [];
    
    // Dimensiones proporcionales para las llantas (cilindros de radio R y ancho W)
    const R = Math.min(0.35, truck.l * 0.23); // Radio de la llanta
    const W = Math.min(0.28, truck.w * 0.18); // Ancho de la llanta
    
    // Las llantas van ubicadas en las dos esquinas traseras (desde X = -truck.l/2)
    return [
        {
            minX: -truck.l / 2,
            maxX: -truck.l / 2 + 2 * R,
            minY: 0,
            maxY: R,
            minZ: -truck.w / 2,
            maxZ: -truck.w / 2 + W,
            radius: R,
            width: W,
            name: 'Llanta Trasera Izquierda'
        },
        {
            minX: -truck.l / 2,
            maxX: -truck.l / 2 + 2 * R,
            minY: 0,
            maxY: R,
            minZ: truck.w / 2 - W,
            maxZ: truck.w / 2,
            radius: R,
            width: W,
            name: 'Llanta Trasera Derecha'
        }
    ];
}

function getWheelWellMinYForCoord(x, z, item, t) {
    const truck = t || fleet[currentTruckIdx];
    if (!truck) return 0;
    
    const wells = getWheelWells(truck);
    let minBaseY = 0;
    
    const minX = x - item.l / 2;
    const maxX = x + item.l / 2;
    const minZ = z - item.w / 2;
    const maxZ = z + item.w / 2;
    const tolerance = 0.005;
    
    for (let well of wells) {
        const overlapX = (minX + tolerance < well.maxX) && (maxX - tolerance > well.minX);
        const overlapZ = (minZ + tolerance < well.maxZ) && (maxZ - tolerance > well.minZ);
        
        if (overlapX && overlapZ) {
            if (well.maxY > minBaseY) {
                minBaseY = well.maxY;
            }
        }
    }
    return minBaseY;
}

function getStackedYForTruck(t, x, z, item) {
    let maxSupportY = getWheelWellMinYForCoord(x, z, item, t) + item.h / 2;
    
    t.group.children.forEach(other => {
        if (other.type !== 'Mesh') return;
        
        const otherItem = cargoItems.find(i => i.id === other.userData.itemId);
        if (!otherItem) return;
        
        // Bounding boxes 2D en plano X-Z
        const minX = x - item.l / 2;
        const maxX = x + item.l / 2;
        const minZ = z - item.w / 2;
        const maxZ = z + item.w / 2;
        
        const ominX = other.position.x - otherItem.l / 2;
        const omaxX = other.position.x + otherItem.l / 2;
        const ominZ = other.position.z - otherItem.w / 2;
        const omaxZ = other.position.z + otherItem.w / 2;
        
        // Tolerancia milimÃ©trica para evitar imprecisiones de flotantes
        const tolerance = 0.005;
        const overlapX = (minX + tolerance < omaxX) && (maxX - tolerance > ominX);
        const overlapZ = (minZ + tolerance < omaxZ) && (maxZ - tolerance > ominZ);
        
        if (overlapX && overlapZ) {
            // --- VALIDACIÃ“N DE REGLAS DE APILAMIENTO ---
            // 0. Los Nivel 0 (violeta) no pueden ir encima de nada, y nada puede ir encima de ellos.
            // 1. Los Nivel 1 (verde) sÃ³lo pueden ir encima de Nivel 1.
            // 2. Los Nivel 2 (amarillo) sÃ³lo pueden ir encima de Nivel 1.
            // 3. Los Nivel 3 (rojo) pueden ir encima de cualquiera (excepto Nivel 0).
            let canStackOnTop = true;
            
            if (otherItem.apilamiento === 0) {
                canStackOnTop = false; // Nada puede ir encima de Nivel 0
            } else if (item.apilamiento === 0) {
                canStackOnTop = false; // Nivel 0 no puede ir encima de nada
            } else if (item.apilamiento === 1) {
                canStackOnTop = (otherItem.apilamiento === 1); // Nivel 1 sÃ³lo puede ir sobre Nivel 1
            } else if (item.apilamiento === 2) {
                canStackOnTop = (otherItem.apilamiento === 1); // Nivel 2 sÃ³lo puede ir sobre Nivel 1
            } else if (item.apilamiento === 3) {
                canStackOnTop = (otherItem.apilamiento !== 0); // Nivel 3 puede ir sobre cualquiera excepto Nivel 0
            }
            
            if (canStackOnTop) {
                // Si hay solape horizontal, calcular altura superior
                const otherTop = other.position.y + otherItem.h / 2;
                const targetY = otherTop + item.h / 2;
                if (targetY > maxSupportY) {
                    maxSupportY = targetY;
                }
            }
        }
    });
    return maxSupportY;
}

function checkOverlap3D(t, posX, posY, posZ, item) {
    let hasOverlap = false;
    
    // A. Verificar solape con guardabarros
    const wells = getWheelWells(t);
    const minX = posX - item.l / 2;
    const maxX = posX + item.l / 2;
    const minY = posY - item.h / 2;
    const maxY = posY + item.h / 2;
    const minZ = posZ - item.w / 2;
    const maxZ = posZ + item.w / 2;
    const tolerance = 0.005;
    
    for (let well of wells) {
        const overlapWellX = (minX + tolerance < well.maxX) && (maxX - tolerance > well.minX);
        const overlapWellY = (minY + tolerance < well.maxY) && (maxY - tolerance > well.minY);
        const overlapWellZ = (minZ + tolerance < well.maxZ) && (maxZ - tolerance > well.minZ);
        
        if (overlapWellX && overlapWellY && overlapWellZ) {
            return true;
        }
    }
    
    // B. Verificar solape con otras mallas
    t.group.children.forEach(other => {
        if (other.type !== 'Mesh' || hasOverlap) return;
        
        const otherItem = cargoItems.find(i => i.id === other.userData.itemId);
        if (!otherItem) return;
        
        const ominX = other.position.x - otherItem.l / 2;
        const omaxX = other.position.x + otherItem.l / 2;
        const ominY = other.position.y - otherItem.h / 2;
        const omaxY = other.position.y + otherItem.h / 2;
        const ominZ = other.position.z - otherItem.w / 2;
        const omaxZ = other.position.z + otherItem.w / 2;
        
        const overlapX = (minX + tolerance < omaxX) && (maxX - tolerance > ominX);
        const overlapY = (minY + tolerance < omaxY) && (maxY - tolerance > ominY);
        const overlapZ = (minZ + tolerance < omaxZ) && (maxZ - tolerance > ominZ);
        
        if (overlapX && overlapY && overlapZ) {
            hasOverlap = true;
        }
    });
    return hasOverlap;
}

function calculateLoad() {
    if (cargoItems.length === 0) {
        alert('Por favor, importa una lista de carga primero.');
        return;
    }
    
    // 1. Limpiar toda la carga en todas las camionetas existentes
    fleet.forEach(t => {
        while(t.group.children.length > 0) {
            t.group.remove(t.group.children[0]);
        }
    });
    interactableMeshes = [];
    if (dragControls) dragControls.dispose();
    
    cargoItems.forEach(item => {
        item.truckId = null;
        // Restaurar dimensiones originales si fueron rotados en ejecuciones anteriores
        if (item.originalL) {
            item.l = item.originalL;
            item.w = item.originalW;
        } else {
            item.originalL = item.l;
            item.originalW = item.w;
        }
    });
    
    // 2. Guardar las dimensiones de la primera camioneta como plantilla
    const templateTruck = {
        l: fleet[0].l,
        w: fleet[0].w,
        h: fleet[0].h,
        cap: fleet[0].cap || 1000
    };
    
    // Dejar sÃ³lo la primera camioneta en la flota al inicio para reconstruirla limpiamente
    fleet = [fleet[0]];
    currentTruckIdx = 0;
    
    // 3. Ordenar bultos por nivel de apilamiento y volumen descendente
    // Es CRÃTICO colocar Nivel 0 y 1 primero para crear bases sÃ³lidas, y dejar 3 al final.
    let itemsToLoad = [...cargoItems].sort((a, b) => {
        if (a.apilamiento !== b.apilamiento) {
            return a.apilamiento - b.apilamiento;
        }
        return (b.l * b.w * b.h) - (a.l * a.w * a.h);
    });

    let truckIdx = 0;
    
    while (itemsToLoad.length > 0) {
        let t = fleet[truckIdx];
        if (!t) {
            // Crear una nueva camioneta idÃ©ntica en dimensiones a la plantilla
            const newId = fleet.length + 1;
            t = {
                id: newId,
                l: templateTruck.l,
                w: templateTruck.w,
                h: templateTruck.h,
                cap: templateTruck.cap || 1000,
                group: new THREE.Group()
            };
            fleet.push(t);
        }

        const truckCap = t.cap || 1000;
        let currentWeight = 0;
        let placedItemsInTruck = [];
        let itemsForNextTruck = [];

        // Inicializar los puntos extremos (Extreme Points) para esta camioneta
        // El primer punto es la esquina posterior izquierda inferior: (-l/2, 0, -w/2)
        const wells = getWheelWells(t);
        let candidatePoints = [{ x: -t.l / 2, y: 0, z: -t.w / 2 }];
        
        // Agregar las esquinas superiores de los guardabarros como puntos iniciales de empaque
        wells.forEach(well => {
            candidatePoints.push({ x: well.minX, y: well.maxY, z: well.minZ });
        });
        
        // Filtrar puntos iniciales que queden dentro de los guardabarros
        candidatePoints = candidatePoints.filter(cp => {
            for (let well of wells) {
                const insideWellX = (cp.x >= well.minX - 0.001) && (cp.x < well.maxX - 0.001);
                const insideWellY = (cp.y >= well.minY - 0.001) && (cp.y < well.maxY - 0.001);
                const insideWellZ = (cp.z >= well.minZ - 0.001) && (cp.z < well.maxZ - 0.001);
                if (insideWellX && insideWellY && insideWellZ) return false;
            }
            return true;
        });

        // Helper para validar si una caja cabe y cumple las reglas en una posiciÃ³n
        function isPlacementValid(item, minX, minY, minZ, length, width) {
            const maxX = minX + length;
            const maxY = minY + item.h;
            const maxZ = minZ + width;
            const eps = 0.002; // PequeÃ±a tolerancia

            // A. LÃ­mites de la camioneta
            if (minX < -t.l / 2 - eps || maxX > t.l / 2 + eps) return false;
            if (minZ < -t.w / 2 - eps || maxZ > t.w / 2 + eps) return false;
            if (minY < 0 || maxY > t.h + eps) return false;

            // B. Capacidad de peso
            if (currentWeight + item.peso > truckCap) return false;

            // C. Solapes 3D con cajas ya colocadas
            for (let other of placedItemsInTruck) {
                const oMinX = other.x - other.l / 2;
                const oMaxX = other.x + other.l / 2;
                const oMinY = other.y - other.h / 2;
                const oMaxY = other.y + other.h / 2;
                const oMinZ = other.z - other.w / 2;
                const oMaxZ = other.z + other.w / 2;

                const overlapX = (minX + eps < oMaxX) && (maxX - eps > oMinX);
                const overlapY = (minY + eps < oMaxY) && (maxY - eps > oMinY);
                const overlapZ = (minZ + eps < oMaxZ) && (maxZ - eps > oMinZ);

                if (overlapX && overlapY && overlapZ) {
                    return false;
                }
            }

            // C2. Solapes con guardabarros (pasa-ruedas)
            for (let well of wells) {
                const overlapWellX = (minX + eps < well.maxX) && (maxX - eps > well.minX);
                const overlapWellY = (minY + eps < well.maxY) && (maxY - eps > well.minY);
                const overlapWellZ = (minZ + eps < well.maxZ) && (maxZ - eps > well.minZ);

                if (overlapWellX && overlapWellY && overlapWellZ) {
                    return false;
                }
            }

            // D. Estabilidad fÃ­sica y Reglas de Apilamiento
            if (minY > 0) {
                let supported = false;
                
                // --- SOPORTE POR GUÃABARROS ---
                for (let well of wells) {
                    if (Math.abs(well.maxY - minY) < 0.01) {
                        const overlapMinX = Math.max(minX, well.minX);
                        const overlapMaxX = Math.min(maxX, well.maxX);
                        const overlapMinZ = Math.max(minZ, well.minZ);
                        const overlapMaxZ = Math.min(maxZ, well.maxZ);
                        
                        if (overlapMaxX > overlapMinX + 0.01 && overlapMaxZ > overlapMinZ + 0.01) {
                            supported = true;
                            break;
                        }
                    }
                }
                
                if (!supported) {
                    for (let other of placedItemsInTruck) {
                        const oMinX = other.x - other.l / 2;
                        const oMaxX = other.x + other.l / 2;
                        const oMinY = other.y - other.h / 2;
                        const oMaxY = other.y + other.h / 2;
                        const oMinZ = other.z - other.w / 2;
                        const oMaxZ = other.z + other.w / 2;

                        // Si estÃ¡ directamente apoyada sobre la superficie superior de otra caja
                        if (Math.abs(oMaxY - minY) < 0.01) {
                            const overlapMinX = Math.max(minX, oMinX);
                            const overlapMaxX = Math.min(maxX, oMaxX);
                            const overlapMinZ = Math.max(minZ, oMinZ);
                            const overlapMaxZ = Math.min(maxZ, oMaxZ);

                            if (overlapMaxX > overlapMinX + 0.01 && overlapMaxZ > overlapMinZ + 0.01) {
                                // Validar reglas de apilamiento
                                const otherItem = cargoItems.find(i => i.id === other.itemId);
                                if (otherItem) {
                                    let canStack = true;
                                    if (otherItem.apilamiento === 0) {
                                        canStack = false; // Nada puede ir sobre Nivel 0
                                    } else if (item.apilamiento === 0) {
                                        canStack = false; // Nivel 0 no va sobre nada
                                    } else if (item.apilamiento === 1) {
                                        canStack = (otherItem.apilamiento === 1); // 1 sobre 1
                                    } else if (item.apilamiento === 2) {
                                        canStack = (otherItem.apilamiento === 1); // 2 sobre 1
                                    } else if (item.apilamiento === 3) {
                                        canStack = (otherItem.apilamiento !== 0); // 3 sobre cualquier cosa excepto 0
                                    }

                                    if (!canStack) return false;
                                    supported = true;
                                }
                            }
                        }
                    }
                }
                if (!supported) return false; // Debe tener soporte
            }

            return true;
        }

        // Iterar sobre cada item e intentar acomodarlo
        for (let i = 0; i < itemsToLoad.length; i++) {
            let item = itemsToLoad[i];
            let bestScore = Infinity;
            let bestPlacement = null;

            // Ordenar los puntos de interÃ©s para preferir siempre llenar de abajo hacia arriba, de atrÃ¡s hacia adelante, y de izquierda a derecha
            candidatePoints.sort((a, b) => {
                if (Math.abs(a.y - b.y) > 0.001) return a.y - b.y;
                if (Math.abs(a.z - b.z) > 0.001) return a.z - b.z;
                return a.x - b.x;
            });

            for (let cp of candidatePoints) {
                // Probar ambas orientaciones (normal y rotada 90 grados en el plano X-Z)
                const orientations = [
                    { l: item.l, w: item.w, rotated: false },
                    { l: item.w, w: item.l, rotated: true }
                ];

                for (let orient of orientations) {
                    if (isPlacementValid(item, cp.x, cp.y, cp.z, orient.l, orient.w)) {
                        // Puntaje de empaquetamiento: preferir menor Y, luego menor Z, luego menor X
                        const dx = cp.x - (-t.l / 2);
                        const dz = cp.z - (-t.w / 2);
                        const dy = cp.y;
                        const score = dy * 10000 + dz * 100 + dx;

                        if (score < bestScore) {
                            bestScore = score;
                            bestPlacement = {
                                cp: cp,
                                x: cp.x + orient.l / 2,
                                y: cp.y + item.h / 2,
                                z: cp.z + orient.w / 2,
                                l: orient.l,
                                w: orient.w,
                                rotated: orient.rotated
                            };
                        }
                    }
                }
            }

            if (bestPlacement) {
                // Acomodar la caja
                if (bestPlacement.rotated) {
                    item.l = bestPlacement.l;
                    item.w = bestPlacement.w;
                }
                createBoxMesh(item, bestPlacement.x, bestPlacement.y, bestPlacement.z, t);
                item.truckId = t.id;
                currentWeight += item.peso;

                placedItemsInTruck.push({
                    itemId: item.id,
                    x: bestPlacement.x,
                    y: bestPlacement.y,
                    z: bestPlacement.z,
                    l: bestPlacement.l,
                    w: bestPlacement.w,
                    h: item.h
                });

                // Generar nuevos Extreme Points basados en las 3 caras expuestas
                const px = bestPlacement.cp.x;
                const py = bestPlacement.cp.y;
                const pz = bestPlacement.cp.z;

                candidatePoints.push({ x: px + bestPlacement.l, y: py, z: pz });
                candidatePoints.push({ x: px, y: py, z: pz + bestPlacement.w });
                candidatePoints.push({ x: px, y: py + item.h, z: pz });

                // Filtrar puntos que queden dentro de la caja colocada o fuera de la tolva o dentro de los guardabarros
                const minX = px;
                const maxX = px + bestPlacement.l;
                const minY = py;
                const maxY = py + item.h;
                const minZ = pz;
                const maxZ = pz + bestPlacement.w;

                candidatePoints = candidatePoints.filter(cp => {
                    // Si estÃ¡ estrictamente dentro de la caja (con epsilon)
                    const insideX = (cp.x >= minX - 0.001) && (cp.x < maxX - 0.001);
                    const insideY = (cp.y >= minY - 0.001) && (cp.y < maxY - 0.001);
                    const insideZ = (cp.z >= minZ - 0.001) && (cp.z < maxZ - 0.001);
                    
                    // Si estÃ¡ estrictamente dentro de algÃºn guardabarros
                    for (let well of wells) {
                        const insideWellX = (cp.x >= well.minX - 0.001) && (cp.x < well.maxX - 0.001);
                        const insideWellY = (cp.y >= well.minY - 0.001) && (cp.y < well.maxY - 0.001);
                        const insideWellZ = (cp.z >= well.minZ - 0.001) && (cp.z < well.maxZ - 0.001);
                        if (insideWellX && insideWellY && insideWellZ) {
                            return false;
                        }
                    }
                    
                    // Si estÃ¡ fuera de lÃ­mites de la tolva
                    const outsideTruck = cp.x < -t.l / 2 - 0.001 || cp.x > t.l / 2 - 0.005 ||
                                         cp.z < -t.w / 2 - 0.001 || cp.z > t.w / 2 - 0.005 ||
                                         cp.y < 0 || cp.y > t.h - 0.005;

                    return !(insideX && insideY && insideZ) && !outsideTruck;
                });

                // Remover duplicados
                const uniquePoints = [];
                candidatePoints.forEach(p => {
                    if (!uniquePoints.some(u => Math.abs(u.x - p.x) < 0.005 && Math.abs(u.y - p.y) < 0.005 && Math.abs(u.z - p.z) < 0.005)) {
                        uniquePoints.push(p);
                    }
                });
                candidatePoints = uniquePoints;
            } else {
                // No cupo en esta camioneta, pasa a la lista de la siguiente
                itemsForNextTruck.push(item);
            }
        }

        // Si no se pudo colocar nada en esta camioneta pero quedan elementos para evitar bucles infinitos
        if (placedItemsInTruck.length === 0 && itemsToLoad.length > 0) {
            const forcedItem = itemsToLoad.shift();
            createBoxMesh(forcedItem, 0, forcedItem.h / 2, 0, t);
            forcedItem.truckId = t.id;
            itemsForNextTruck = itemsToLoad;
        } else {
            itemsToLoad = itemsForNextTruck;
        }

        truckIdx++;
    }

    // Actualizar UI del paginador de camionetas y visualizaciÃ³n de la camioneta activa
    currentTruckIdx = 0;
    updateFleetUI();
    
    initDragControls();
    recalculateAllHeights(); // Estabilizar fÃ­sica y apilamiento en todas las cajas de la camioneta activa
    
    alert(`Â¡Carga completada de forma Ã³ptima! Se han creado y cargado automÃ¡ticamente ${fleet.length} camionetas para albergar todos los bultos de la lista.`);
}

function updateStats() {
    const t = fleet[currentTruckIdx];
    const group = t.group;
    let truckVol = t.l * t.w * t.h;
    let truckCap = t.cap || 1000;
    
    let loadedCount = group.children.filter(m => m.type === 'Mesh').length;
    let usedVol = 0;
    let usedWeight = 0;
    let hasHeightViolation = false;
    
    group.children.forEach(m => {
        if(m.type === 'Mesh') {
           const param = m.geometry.parameters;
           usedVol += (param.width * param.height * param.depth);
           
           const item = cargoItems.find(i => i.id === m.userData.itemId);
           if (item) {
               if (item.peso) usedWeight += item.peso;
               
               // Colorear de rojo brillante si la caja supera el lÃ­mite de altura de la tolva
               const boxTop = m.position.y + item.h / 2;
               if (boxTop > t.h + 0.01) {
                   m.material.emissive.setHex(0xff3333); // Rojo de alerta
                   hasHeightViolation = true;
               } else {
                   m.material.emissive.setHex(0x000000); // Color normal
               }
           }
        }
    });

    statLoaded.innerText = loadedCount;
    statVol.innerText = ((usedVol / truckVol) * 100).toFixed(1) + '%';
    
    const weightPct = ((usedWeight / truckCap) * 100).toFixed(1);
    const statWeightEl = document.getElementById('stat-weight');
    const weightWarningEl = document.getElementById('weight-warning');
    const heightWarningEl = document.getElementById('height-warning');
    
    if (statWeightEl) {
        statWeightEl.innerText = `${usedWeight.toFixed(1)} / ${truckCap} kg (${weightPct}%)`;
        if (usedWeight > truckCap) {
            statWeightEl.style.color = '#f85149';
            statWeightEl.style.fontWeight = 'bold';
            if (weightWarningEl) weightWarningEl.style.display = 'block';
        } else {
            statWeightEl.style.color = '';
            statWeightEl.style.fontWeight = '';
            if (weightWarningEl) weightWarningEl.style.display = 'none';
        }
    }
    
    if (heightWarningEl) {
        heightWarningEl.style.display = hasHeightViolation ? 'block' : 'none';
    }
}

function createTextTexture(text, bgColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 512);
    
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    
    const maxLength = 22;
    if (text.length > maxLength) {
        let line1 = text;
        let line2 = "";
        
        const parenIdx = text.indexOf('(');
        if (parenIdx !== -1) {
            line1 = text.substring(0, parenIdx).trim();
            line2 = text.substring(parenIdx).trim();
        } else {
            const spaceIdx = text.indexOf(' ', Math.floor(text.length / 2));
            if (spaceIdx !== -1) {
                line1 = text.substring(0, spaceIdx).trim();
                line2 = text.substring(spaceIdx).trim();
            }
        }
        
        ctx.font = 'bold 38px Arial';
        ctx.fillText(line1, 256, 220);
        ctx.font = 'bold 30px Arial';
        ctx.fillStyle = '#eeeeee';
        ctx.fillText(line2, 256, 290);
    } else {
        ctx.font = 'bold 44px Arial';
        ctx.fillText(text, 256, 256);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function createBoxMesh(item, x, y, z, targetTruck) {
    const geometry = new THREE.BoxGeometry(item.l, item.h, item.w);
    
    const texture = createTextTexture(item.name, item.color);
    
    // Material con la textura del nombre
    const material = new THREE.MeshPhongMaterial({ 
        map: texture,
        transparent: false, 
        shininess: 30
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.itemId = item.id;
    
    // Bordes para distinguir cada caja
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x111111, opacity: 0.5, transparent: true }));
    line.raycast = () => {}; // Evitar que el raycast interfiera con los bordes
    mesh.add(line);
    
    mesh.position.set(x, y, z);
    
    const truck = targetTruck || fleet[currentTruckIdx];
    truck.group.add(mesh);
    
    if (truck.id === fleet[currentTruckIdx].id) {
        interactableMeshes.push(mesh);
    }
}

function initDragControls() {
    if (dragControls) dragControls.dispose();
    dragControls = new THREE.DragControls(interactableMeshes, camera, renderer.domElement);
    
    // Desactivar controles orbitales al pasar el mouse por encima de una caja para dar prioridad al arrastre
    dragControls.addEventListener('hoveron', function (event) {
        controls.enabled = false;
        renderer.domElement.style.cursor = 'pointer';
    });
    
    dragControls.addEventListener('hoveroff', function (event) {
        if (!isDragging) {
            controls.enabled = true;
            renderer.domElement.style.cursor = 'auto';
        }
    });
    
    dragControls.addEventListener('dragstart', function (event) {
        isDragging = true;
        controls.enabled = false;
        event.object.material.emissive.set(0x333333); // Resaltar caja
    });
    
    dragControls.addEventListener('drag', function (event) {
        const item = cargoItems.find(i => i.id === event.object.userData.itemId);
        if (item) {
            // Restringir a lÃ­mites de la tolva de la camioneta
            const t = fleet[currentTruckIdx];
            const halfL = t.l / 2;
            const halfW = t.w / 2;
            const halfItemL = item.l / 2;
            const halfItemW = item.w / 2;
            
            event.object.position.x = Math.max(-halfL + halfItemL, Math.min(halfL - halfItemL, event.object.position.x));
            event.object.position.z = Math.max(-halfW + halfItemW, Math.min(halfW - halfItemW, event.object.position.z));
            
            // Apilamiento automÃ¡tico: calcular altura en base a cajas abajo
            event.object.position.y = getStackedY(event.object.position.x, event.object.position.z, item, event.object);
            
            // Alerta de altura durante el arrastre
            const boxTop = event.object.position.y + item.h / 2;
            if (boxTop > t.h + 0.01) {
                event.object.material.emissive.setHex(0xff3333); // Rojo de alerta
            } else {
                event.object.material.emissive.setHex(0x333333); // Resaltado de arrastre
            }
        }
    });
    
    dragControls.addEventListener('dragend', function (event) {
        isDragging = false;
        controls.enabled = true;
        renderer.domElement.style.cursor = 'auto';
        
        // Recalcular apilamiento estable de toda la camioneta en cascada
        recalculateAllHeights();
    });
}

function showContextMenu(e, mesh) {
    selectedMesh = mesh;
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    
    // Poblar dinÃ¡micamente el submenÃº de camionetas
    const submenu = document.getElementById('submenu-trucks');
    if (submenu) {
        submenu.innerHTML = '';
        const currentTruckId = fleet[currentTruckIdx].id;
        
        let targetTrucksExist = false;
        fleet.forEach(truck => {
            if (truck.id !== currentTruckId) {
                targetTrucksExist = true;
                const li = document.createElement('li');
                li.innerHTML = `ðŸšš Camioneta ${truck.id}`;
                li.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    moveMeshToTruck(selectedMesh, truck.id);
                });
                submenu.appendChild(li);
            }
        });
        
        // OpciÃ³n para crear una nueva camioneta y moverla directamente
        const liNew = document.createElement('li');
        liNew.innerHTML = `<span style="color:var(--accent-green);">âž• Nueva Camioneta</span>`;
        liNew.addEventListener('click', (ev) => {
            ev.stopPropagation();
            addTruck(); // Esto cambia la camioneta activa a la nueva
            moveMeshToTruck(selectedMesh, fleet[currentTruckIdx].id);
        });
        submenu.appendChild(liNew);
    }
}

function moveMeshToTruck(mesh, targetTruckId) {
    if (!mesh) return;
    
    const itemId = mesh.userData.itemId;
    const item = cargoItems.find(i => i.id === itemId);
    if (!item) return;

    // Verificar capacidad en la camioneta destino
    const targetTruck = fleet.find(t => t.id === targetTruckId);
    if (!targetTruck) return;

    const truckCap = targetTruck.cap || 1000;
    
    // Calcular peso actual de la camioneta de destino
    let targetWeight = 0;
    targetTruck.group.children.forEach(m => {
        if (m.type === 'Mesh') {
            const it = cargoItems.find(i => i.id === m.userData.itemId);
            if (it && it.peso) targetWeight += it.peso;
        }
    });

    if (targetWeight + item.peso > truckCap) {
        alert(`No se puede mover la caja. SuperarÃ­a la capacidad de peso de la Camioneta ${targetTruckId} (${truckCap} kg).`);
        contextMenu.style.display = 'none';
        selectedMesh = null;
        return;
    }

    // 1. Quitar el mesh de la camioneta actual
    fleet[currentTruckIdx].group.remove(mesh);
    interactableMeshes = interactableMeshes.filter(m => m !== mesh);
    
    // 2. Cambiar el truckId en el item
    item.truckId = targetTruckId;
    
    // 3. Crear el mesh en la camioneta destino
    // Colocarlo centrado en el piso por defecto
    const posX = 0;
    const posY = item.h / 2;
    const posZ = 0;
    
    const geometry = new THREE.BoxGeometry(item.l, item.h, item.w);
    const texture = createTextTexture(item.name, item.color);
    const material = new THREE.MeshPhongMaterial({ map: texture, shininess: 30 });
    const newMesh = new THREE.Mesh(geometry, material);
    newMesh.userData.itemId = item.id;
    
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x111111, opacity: 0.5, transparent: true }));
    line.raycast = () => {}; // Evitar que el raycast interfiera con los bordes
    newMesh.add(line);
    newMesh.position.set(posX, posY, posZ);
    
    targetTruck.group.add(newMesh);
    
    // Si la camioneta activa es la destino, la aÃ±adimos a los meshes interactivos inmediatamente
    if (targetTruckId === fleet[currentTruckIdx].id) {
        interactableMeshes.push(newMesh);
    }
    
    // 4. Actualizar
    updateStats();
    renderCargoList();
    initDragControls();
    
    contextMenu.style.display = 'none';
    selectedMesh = null;
}

function removeMeshFromTruck(mesh) {
    fleet[currentTruckIdx].group.remove(mesh);
    interactableMeshes = interactableMeshes.filter(m => m !== mesh);
    
    const item = cargoItems.find(i => i.id === mesh.userData.itemId);
    if (item) item.truckId = null;
    
    // Recalcular el apilamiento tras remover una caja de soporte
    recalculateAllHeights();
    
    contextMenu.style.display = 'none';
    selectedMesh = null;
}

function rotateMesh(mesh) {
    if (!mesh) return;
    const itemId = mesh.userData.itemId;
    const item = cargoItems.find(i => i.id === itemId);
    if (!item) return;
    
    // Intercambiar Largo y Ancho (L y W) en el item
    const temp = item.l;
    item.l = item.w;
    item.w = temp;
    
    // Actualizar la geometrÃ­a del mesh en Three.js
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(item.l, item.h, item.w);
    
    // Si tiene bordes (wireframe), tambiÃ©n debemos actualizarlos
    const line = mesh.children.find(c => c.type === 'LineSegments');
    if (line) {
        mesh.remove(line);
        line.geometry.dispose();
        const newEdges = new THREE.EdgesGeometry(mesh.geometry);
        const newLine = new THREE.LineSegments(newEdges, line.material);
        newLine.raycast = () => {}; // Mantener excluido de raycast
        mesh.add(newLine);
    }
    
    // Reajustar lÃ­mites fÃ­sicos laterales de la tolva
    const t = fleet[currentTruckIdx];
    const halfL = t.l / 2;
    const halfW = t.w / 2;
    const halfItemL = item.l / 2;
    const halfItemW = item.w / 2;
    
    mesh.position.x = Math.max(-halfL + halfItemL, Math.min(halfL - halfItemL, mesh.position.x));
    mesh.position.z = Math.max(-halfW + halfItemW, Math.min(halfW - halfItemW, mesh.position.z));
    
    // Recalcular apilamiento y actualizar estadÃ­sticas
    recalculateAllHeights();
}

function getStackedY(x, z, item, excludeMesh, stableMeshes) {
    const t = fleet[currentTruckIdx];
    let maxSupportY = getWheelWellMinYForCoord(x, z, item, t) + item.h / 2;
    
    // Si se pasa stableMeshes (durante la cascada de recalculaciÃ³n), usamos solo esos meshes ya validados.
    // De lo contrario (ej. durante el arrastre libre interactivo), filtramos interactableMeshes para
    // considerar como soporte Ãºnicamente a las cajas que estÃ©n fÃ­sicamente por debajo de la actual.
    const candidates = stableMeshes || interactableMeshes.filter(other => {
        if (!excludeMesh) return true;
        return other.position.y + 0.01 < excludeMesh.position.y;
    });

    candidates.forEach(other => {
        if (other === excludeMesh) return;
        
        const otherItem = cargoItems.find(i => i.id === other.userData.itemId);
        if (!otherItem) return;
        
        // Bounding boxes 2D en plano X-Z
        const minX = x - item.l / 2;
        const maxX = x + item.l / 2;
        const minZ = z - item.w / 2;
        const maxZ = z + item.w / 2;
        
        const ominX = other.position.x - otherItem.l / 2;
        const omaxX = other.position.x + otherItem.l / 2;
        const ominZ = other.position.z - otherItem.w / 2;
        const omaxZ = other.position.z + otherItem.w / 2;
        
        // Tolerancia milimÃ©trica para evitar imprecisiones de flotantes
        const tolerance = 0.005;
        const overlapX = (minX + tolerance < omaxX) && (maxX - tolerance > ominX);
        const overlapZ = (minZ + tolerance < omaxZ) && (maxZ - tolerance > ominZ);
        
        if (overlapX && overlapZ) {
            // --- VALIDACIÃ“N DE REGLAS DE APILAMIENTO ---
            // 0. Los Nivel 0 (violeta) no pueden ir encima de nada, y nada puede ir encima de ellos.
            // 1. Los Nivel 1 (verde) sÃ³lo pueden ir encima de Nivel 1.
            // 2. Los Nivel 2 (amarillo) sÃ³lo pueden ir encima de Nivel 1.
            // 3. Los Nivel 3 (rojo) pueden ir encima de cualquiera (excepto Nivel 0).
            let canStackOnTop = true;
            
            if (otherItem.apilamiento === 0) {
                canStackOnTop = false; // Nada puede ir encima de Nivel 0
            } else if (item.apilamiento === 0) {
                canStackOnTop = false; // Nivel 0 no puede ir encima de nada
            } else if (item.apilamiento === 1) {
                canStackOnTop = (otherItem.apilamiento === 1); // Nivel 1 sÃ³lo puede ir sobre Nivel 1
            } else if (item.apilamiento === 2) {
                canStackOnTop = (otherItem.apilamiento === 1); // Nivel 2 sÃ³lo puede ir sobre Nivel 1
            } else if (item.apilamiento === 3) {
                canStackOnTop = (otherItem.apilamiento !== 0); // Nivel 3 puede ir sobre cualquiera excepto Nivel 0
            }
            
            if (canStackOnTop) {
                // Si hay solape horizontal, calcular altura superior
                const otherTop = other.position.y + otherItem.h / 2;
                const targetY = otherTop + item.h / 2;
                if (targetY > maxSupportY) {
                    maxSupportY = targetY;
                }
            }
        }
    });
    return maxSupportY;
}

function recalculateAllHeights() {
    // Ordenar los meshes de abajo hacia arriba en Y para asegurar estabilidad en la cascada de apilamiento
    const meshes = [...interactableMeshes].sort((a, b) => a.position.y - b.position.y);
    
    const stableMeshes = [];
    meshes.forEach(mesh => {
        const item = cargoItems.find(i => i.id === mesh.userData.itemId);
        if (item) {
            mesh.position.y = getStackedY(mesh.position.x, mesh.position.z, item, mesh, stableMeshes);
            stableMeshes.push(mesh);
        }
    });
    updateStats();
    renderCargoList();
}

function handleHtmlDropOnCanvas(itemId, clientX, clientY) {
    const item = cargoItems.find(i => i.id === itemId);
    if (!item) return;

    const t = fleet[currentTruckIdx];
    const truckCap = t.cap || 1000;
    
    // Calcular peso actual de la camioneta activa
    let currentWeight = 0;
    t.group.children.forEach(m => {
        if (m.type === 'Mesh') {
            const it = cargoItems.find(i => i.id === m.userData.itemId);
            if (it && it.peso) currentWeight += it.peso;
        }
    });

    if (currentWeight + item.peso > truckCap) {
        alert(`No se puede cargar la caja. SuperarÃ­a la capacidad de peso de la Camioneta ${t.id} (${truckCap} kg).`);
        return;
    }

    const canvasContainer = document.getElementById('canvas-container');
    const rect = canvasContainer.getBoundingClientRect();
    
    // Convertir a NDC
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Interectar con el plano horizontal del piso de la tolva (y = 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(plane, targetPoint)) {
        // Restringir a lÃ­mites de la camioneta
        const halfL = t.l / 2;
        const halfW = t.w / 2;
        const halfItemL = item.l / 2;
        const halfItemW = item.w / 2;
        
        const posX = Math.max(-halfL + halfItemL, Math.min(halfL - halfItemL, targetPoint.x));
        const posZ = Math.max(-halfW + halfItemW, Math.min(halfW - halfItemW, targetPoint.z));
        const posY = getStackedY(posX, posZ, item, null);
        
        // Asignar y cargar
        item.truckId = t.id;
        createBoxMesh(item, posX, posY, posZ);
        
        // Estabilizar cascada de apilamiento
        recalculateAllHeights();
        
        // Re-iniciar controles para registrar el nuevo mesh
        initDragControls();
        
        updateStats();
        renderCargoList();
    }
}

function downloadReport() {
    if (cargoItems.length === 0) {
        alert('No hay datos para exportar. Por favor importa y calcula una carga primero.');
        return;
    }
    
    // Crear un nuevo libro de trabajo (Workbook)
    const wb = XLSX.utils.book_new();
    
    // 1. Hoja de Resumen de Flota
    const summaryData = [];
    
    // Agregar Info de GuÃ­a si existe
    if (guideInfo) {
        summaryData.push(["INFORMACIÃ“N DE LA GUÃA DE REMISIÃ“N DE TALLER"]);
        summaryData.push(["NÂ° GuÃ­a", guideInfo.nroGuia || ""]);
        summaryData.push(["Destinatario", guideInfo.destinatario || ""]);
        summaryData.push(["Placa del VehÃ­culo", guideInfo.placa || ""]);
        summaryData.push(["Conductor Asignado", guideInfo.conductor || ""]);
        summaryData.push(["Punto de Entrega", guideInfo.entrega || ""]);
        summaryData.push(["Peso Total Declarado (kg)", guideInfo.pesoTotal || 0]);
        summaryData.push([]);
    }
    
    summaryData.push(["RESUMEN DE FLOTA DE CAMIONETAS"]);
    summaryData.push([
        "Camioneta", 
        "Largo (m)", 
        "Ancho (m)", 
        "Alto (m)", 
        "Capacidad MÃ¡x (kg)", 
        "Peso Cargado (kg)", 
        "Uso Peso (%)", 
        "Uso Volumen (%)", 
        "Total Cajas Cargadas"
    ]);
    
    fleet.forEach(truck => {
        const group = truck.group;
        const truckVol = truck.l * truck.w * truck.h;
        const truckCap = truck.cap || 1000;
        
        let loadedCount = 0;
        let usedVol = 0;
        let usedWeight = 0;
        
        group.children.forEach(m => {
            if(m.type === 'Mesh') {
               const param = m.geometry.parameters;
               usedVol += (param.width * param.height * param.depth);
               
               const item = cargoItems.find(i => i.id === m.userData.itemId);
               if (item) {
                   usedWeight += item.peso || 0;
                   loadedCount++;
               }
            }
        });
        
        const weightPct = ((usedWeight / truckCap) * 100).toFixed(1) + "%";
        const volPct = ((usedVol / truckVol) * 100).toFixed(1) + "%";
        
        summaryData.push([
            `Camioneta ${truck.id}`,
            truck.l,
            truck.w,
            truck.h,
            truckCap,
            usedWeight.toFixed(1),
            weightPct,
            volPct,
            loadedCount
        ]);
    });
    
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen de Carga");
    
    // 2. Hoja de Detalle de Cajas
    const detailData = [[
        "ID Caja", 
        "CÃ³digo/DescripciÃ³n", 
        "Largo (m)", 
        "Ancho/Profundidad (m)", 
        "Alto (m)", 
        "Peso (kg)", 
        "Nivel Apilamiento (1-3)", 
        "Estado", 
        "Camioneta Asignada", 
        "PosiciÃ³n X (Centro Tolva)", 
        "PosiciÃ³n Y (Piso Tolva)", 
        "PosiciÃ³n Z (Ancho Tolva)"
    ]];
    
    cargoItems.forEach(item => {
        let statusStr = "Falta cargar";
        let truckStr = "Ninguna";
        let posX = "";
        let posY = "";
        let posZ = "";
        
        // Buscar el mesh en la flota para saber su posiciÃ³n actual
        let foundMesh = null;
        for (let i = 0; i < fleet.length; i++) {
            const m = fleet[i].group.children.find(child => child.type === 'Mesh' && child.userData.itemId === item.id);
            if (m) {
                foundMesh = m;
                statusStr = "Cargado";
                truckStr = `Camioneta ${fleet[i].id}`;
                posX = m.position.x.toFixed(3);
                posY = m.position.y.toFixed(3);
                posZ = m.position.z.toFixed(3);
                break;
            }
        }
        
        detailData.push([
            item.id,
            item.name,
            item.l,
            item.w,
            item.h,
            item.peso,
            item.apilamiento,
            statusStr,
            truckStr,
            posX,
            posY,
            posZ
        ]);
    });
    
    const wsDetails = XLSX.utils.aoa_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, wsDetails, "Detalle de Cajas");
    
    // Exportar Excel
    let filename = "Reporte_Carga_Camionetas.xlsx";
    if (guideInfo && guideInfo.nroGuia) {
        filename = `Reporte_Carga_Guia_${guideInfo.nroGuia.replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`;
    }
    XLSX.writeFile(wb, filename);
}

// =========================================================================
// CARGA DE MODELOS 3D REALES (GLTF/GLB)
// =========================================================================
function loadTruckModel(truckType, targetGroup, dims) {
    if (!THREE.GLTFLoader) {
        console.warn("GLTFLoader no está disponible.");
        return;
    }

    const loader = new THREE.GLTFLoader();
    
    // Ruta al modelo.
    const modelUrl = `models/${truckType}.glb`;

    // Crear un pequeÃ±o indicador de carga en pantalla
    let loadingDiv = document.getElementById('glb-loading-indicator');
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'glb-loading-indicator';
        loadingDiv.style.position = 'absolute';
        loadingDiv.style.top = '10px';
        loadingDiv.style.left = '50%';
        loadingDiv.style.transform = 'translateX(-50%)';
        loadingDiv.style.background = 'rgba(0,0,0,0.8)';
        loadingDiv.style.color = 'white';
        loadingDiv.style.padding = '10px 20px';
        loadingDiv.style.borderRadius = '20px';
        loadingDiv.style.zIndex = '9999';
        loadingDiv.style.fontFamily = 'sans-serif';
        document.getElementById('canvas-container').appendChild(loadingDiv);
    }
    loadingDiv.innerText = `Cargando ${truckType}.glb... 0%`;
    loadingDiv.style.display = 'block';

    loader.load(
        modelUrl,
        function (gltf) {
            loadingDiv.style.display = 'none';
            // Ã‰xito: el modelo se ha cargado.
            const meshesToRemove = [];
            targetGroup.children.forEach(child => {
                if (child.type === 'Mesh' || child.type === 'LineSegments' || child.type === 'Group') {
                    meshesToRemove.push(child);
                }
            });
            
            meshesToRemove.forEach(mesh => targetGroup.remove(mesh));

            const model = gltf.scene;

            model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    if (node.material) {
                        node.material.side = THREE.DoubleSide; 
                    }
                }
            });

            // CENTRADO Y ESCALADO AUTOMÃTICO DEL MODELO
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            model.position.x -= center.x;
            model.position.z -= center.z;
            
            const minY = box.min.y;
            const targetFloorY = grid ? grid.position.y : -0.49;
            model.position.y = targetFloorY - minY;
            
            const desiredWidth = dims.w + 0.3; 
            const scaleFactor = desiredWidth / size.x;
            model.scale.set(scaleFactor, scaleFactor, scaleFactor);
            
            const scaledSize = size.clone().multiplyScalar(scaleFactor);
            model.position.z += (scaledSize.z * 0.1); 
            
            targetGroup.add(model);
            console.log(`Modelo 3D (${modelUrl}) cargado exitosamente.`);
        },
        function (xhr) {
            if (xhr.total > 0) {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                loadingDiv.innerText = `Cargando ${truckType}.glb... ${percent}%`;
            } else {
                loadingDiv.innerText = `Cargando ${truckType}.glb... ${(xhr.loaded / 1024 / 1024).toFixed(1)} MB`;
            }
        },
        function (error) {
            loadingDiv.style.display = 'none';
            console.error(`Error cargando ${modelUrl}:`, error);
            // Solo mostramos alerta si NO es un simple 404 (para que no moleste si el archivo simplemente no estÃ¡¡)
            if (error && error.message && !error.message.includes("404")) {
                alert(`Error al cargar el archivo 3D de la camioneta:\n${error.message}\n\nEs posible que el archivo GLB estÃ© corrupto o no sea compatible.`);
            }
        }
    );
}
