/**
 * The scene is where everything is placed, from objects, to lights and cameras.
 *
 * Supports radial menu on an orthographic scene when gzradialmenu.js has been
 * included (useful for mobile devices).
 *
 * @param shaders GZ3D.Shaders instance, if not provided, custom shaders will
 *                not be set.
 * @constructor
 */
GZ3D.Scene = function(shaders)
{
  this.emitter = globalEmitter || new EventEmitter2({verboseMemoryLeak: true});
  this.shaders = shaders;
  this.init();
};

/**
 * Initialize scene
 */
GZ3D.Scene.prototype.init = function()
{
  this.name = 'default';
  this.scene = new THREE.Scene();
  // this.scene.name = this.name;
  this.meshes = {};

  // only support one heightmap for now.
  this.heightmap = null;

  this.selectedEntity = null;

  this.manipulationMode = 'view';
  this.pointerOnMenu = false;

  // loaders
  this.textureLoader = new THREE.TextureLoader();
  this.textureLoader.crossOrigin = '';
  this.colladaLoader = new THREE.ColladaLoader();
  this.stlLoader = new THREE.STLLoader();

  this.renderer = new THREE.WebGLRenderer({antialias: true});
  this.renderer.setPixelRatio(window.devicePixelRatio);
  this.renderer.setClearColor(0xb2b2b2, 1);
  this.renderer.autoClear = false;
  // this.renderer.shadowMapEnabled = true;
  // this.renderer.shadowMapSoft = true;

  // lights
  this.ambient = new THREE.AmbientLight( 0x666666 );
  this.scene.add(this.ambient);

  // camera
  var width = this.getDomElement().width;
  var height = this.getDomElement().height;
  this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  this.defaultCameraPosition = new THREE.Vector3(0, -5, 5);
  this.resetView();

  // Ortho camera and scene for rendering sprites
  // Currently only used for the radial menu
  if (typeof GZ3D.RadialMenu === 'function')
  {
    this.cameraOrtho = new THREE.OrthographicCamera(-width * 0.5, width * 0.5,
        height*0.5, -height*0.5, 1, 10);
    this.cameraOrtho.position.z = 10;
    this.sceneOrtho = new THREE.Scene();

    // Radial menu (only triggered by touch)
    this.radialMenu = new GZ3D.RadialMenu(this.getDomElement());
    this.sceneOrtho.add(this.radialMenu.menu);
  }

  // Grid
  this.grid = new THREE.GridHelper(20, 20, 0xCCCCCC, 0x4D4D4D);
  this.grid.name = 'grid';
  this.grid.position.z = 0.05;
  this.grid.rotation.x = Math.PI * 0.5;
  this.grid.castShadow = false;
  this.grid.material.transparent = true;
  this.grid.material.opacity = 0.5;
  this.grid.visible = false;
  this.scene.add(this.grid);

  this.showCollisions = false;

  this.spawnModel = new GZ3D.SpawnModel(
      this, this.getDomElement());

  this.simpleShapesMaterial = new THREE.MeshPhongMaterial(
      {color:0xffffff, shading: THREE.SmoothShading} );

  var that = this;

  // Only capture events inside the webgl div element.
  this.getDomElement().addEventListener( 'mouseup',
      function(event) {that.onPointerUp(event);}, false );

  this.getDomElement().addEventListener( 'mousedown',
      function(event) {that.onPointerDown(event);}, false );

  this.getDomElement().addEventListener( 'DOMMouseScroll',
      function(event) {that.onMouseScroll(event);}, false ); //firefox

  this.getDomElement().addEventListener( 'mousewheel',
      function(event) {that.onMouseScroll(event);}, false );

  this.getDomElement().addEventListener( 'touchstart',
      function(event) {that.onPointerDown(event);}, false );

  this.getDomElement().addEventListener( 'touchend',
      function(event) {that.onPointerUp(event);}, false );

  // Handles for translating and rotating objects
  this.modelManipulator = new GZ3D.Manipulator(this.camera, isTouchDevice,
      this.getDomElement());

  this.timeDown = null;

  this.controls = new THREE.OrbitControls(this.camera,
      this.getDomElement());
  this.scene.add(this.controls.targetIndicator);

  // Bounding Box
  var indices = new Uint16Array(
      [ 0, 1, 1, 2, 2, 3, 3, 0,
        4, 5, 5, 6, 6, 7, 7, 4,
        0, 4, 1, 5, 2, 6, 3, 7 ] );
  var positions = new Float32Array(8 * 3);
  var boxGeometry = new THREE.BufferGeometry();
  boxGeometry.setIndex(new THREE.BufferAttribute( indices, 1 ));
  boxGeometry.addAttribute( 'position',
      new THREE.BufferAttribute(positions, 3));
  this.boundingBox = new THREE.LineSegments(boxGeometry,
      new THREE.LineBasicMaterial({color: 0xffffff}));

  this.boundingBox.visible = false;

  // Joint visuals
  this.jointTypes =
      {
        REVOLUTE: 1,
        REVOLUTE2: 2,
        PRISMATIC: 3,
        UNIVERSAL: 4,
        BALL: 5,
        SCREW: 6,
        GEARBOX: 7,
        FIXED: 8
      };
  this.jointAxis = new THREE.Object3D();
  this.jointAxis.name = 'JOINT_VISUAL';
  var geometry, material, mesh;

  // XYZ
  var XYZaxes = new THREE.Object3D();

  geometry = new THREE.CylinderGeometry(0.01, 0.01, 0.3, 10, 1, false);

  material = new THREE.MeshBasicMaterial({color: new THREE.Color(0xff0000)});
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = 0.15;
  mesh.rotation.z = -Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  XYZaxes.add(mesh);

  material = new THREE.MeshBasicMaterial({color: new THREE.Color(0x00ff00)});
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.15;
  mesh.name = 'JOINT_VISUAL';
  XYZaxes.add(mesh);

  material = new THREE.MeshBasicMaterial({color: new THREE.Color(0x0000ff)});
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 0.15;
  mesh.rotation.x = Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  XYZaxes.add(mesh);

  geometry = new THREE.CylinderGeometry(0, 0.03, 0.1, 10, 1, true);

  material = new THREE.MeshBasicMaterial({color: new THREE.Color(0xff0000)});
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = 0.3;
  mesh.rotation.z = -Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  XYZaxes.add(mesh);

  material = new THREE.MeshBasicMaterial({color: new THREE.Color(0x00ff00)});
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.3;
  mesh.name = 'JOINT_VISUAL';
  XYZaxes.add(mesh);

  material = new THREE.MeshBasicMaterial({color: new THREE.Color(0x0000ff)});
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 0.3;
  mesh.rotation.x = Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  XYZaxes.add(mesh);

  this.jointAxis['XYZaxes'] = XYZaxes;

  var mainAxis = new THREE.Object3D();

  material = new THREE.MeshLambertMaterial();
  material.color = new THREE.Color(0xffff00);

  var mainAxisLen = 0.3;
  geometry = new THREE.CylinderGeometry(0.015, 0.015, mainAxisLen, 36, 1,
      false);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = mainAxisLen * 0.5;
  mesh.rotation.x = Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  mainAxis.add(mesh);

  geometry = new THREE.CylinderGeometry(0, 0.035, 0.1, 36, 1, false);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = mainAxisLen;
  mesh.rotation.x = Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  mainAxis.add(mesh);

  this.jointAxis['mainAxis'] = mainAxis;

  var rotAxis = new THREE.Object3D();

  geometry = new THREE.TorusGeometry(0.04, 0.006, 10, 36, Math.PI * 3/2);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = mainAxisLen;
  mesh.name = 'JOINT_VISUAL';
  rotAxis.add(mesh);

  geometry = new THREE.CylinderGeometry(0.015, 0, 0.025, 10, 1, false);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -0.04;
  mesh.position.z = mainAxisLen;
  mesh.rotation.z = Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  rotAxis.add(mesh);

  this.jointAxis['rotAxis'] = rotAxis;

  var transAxis = new THREE.Object3D();

  geometry = new THREE.CylinderGeometry(0.01, 0.01, 0.1, 10, 1, true);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = 0.03;
  mesh.position.y = 0.03;
  mesh.position.z = mainAxisLen * 0.5;
  mesh.rotation.x = Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  transAxis.add(mesh);

  geometry = new THREE.CylinderGeometry(0.02, 0, 0.0375, 10, 1, false);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = 0.03;
  mesh.position.y = 0.03;
  mesh.position.z = mainAxisLen * 0.5 + 0.05;
  mesh.rotation.x = -Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  transAxis.add(mesh);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = 0.03;
  mesh.position.y = 0.03;
  mesh.position.z = mainAxisLen * 0.5 - 0.05;
  mesh.rotation.x = Math.PI/2;
  mesh.name = 'JOINT_VISUAL';
  transAxis.add(mesh);

  this.jointAxis['transAxis'] = transAxis;

  var screwAxis = new THREE.Object3D();

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = -0.04;
  mesh.position.z = mainAxisLen - 0.11;
  mesh.rotation.z = -Math.PI/4;
  mesh.rotation.x = -Math.PI/10;
  mesh.name = 'JOINT_VISUAL';
  screwAxis.add(mesh);

  var radius = 0.04;
  var length = 0.02;
  var curve = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(radius, 0, 0*length),
      new THREE.Vector3(0, radius, 1*length),
      new THREE.Vector3(-radius, 0, 2*length),
      new THREE.Vector3(0, -radius, 3*length),
      new THREE.Vector3(radius, 0, 4*length),
      new THREE.Vector3(0, radius, 5*length),
      new THREE.Vector3(-radius, 0, 6*length)]);
  geometry = new THREE.TubeGeometry(curve, 36, 0.01, 10, false);

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = mainAxisLen - 0.23;
  mesh.name = 'JOINT_VISUAL';
  screwAxis.add(mesh);

  this.jointAxis['screwAxis'] = screwAxis;

  var ballVisual = new THREE.Object3D();

  geometry = new THREE.SphereGeometry(0.06);

  mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'JOINT_VISUAL';
  ballVisual.add(mesh);

  this.jointAxis['ballVisual'] = ballVisual;

  // center of mass visual
  this.COMvisual = new THREE.Object3D();
  this.COMvisual.name = 'COM_VISUAL';

  geometry = new THREE.SphereGeometry(1, 32, 32);

  mesh = new THREE.Mesh(geometry);
  this.setMaterial(mesh, {'ambient':[0.5,0.5,0.5,1.000000],
    'texture':'assets/media/materials/textures/com.png'});
  mesh.name = 'COM_VISUAL';
  mesh.rotation.z = -Math.PI/2;
  this.COMvisual.add(mesh);
};

GZ3D.Scene.prototype.initScene = function()
{
  this.emitter.emit('show_grid', 'show');

  // create a sun light
  var obj = this.createLight(3, new THREE.Color(0.8, 0.8, 0.8), 0.9,
       {position: {x:0, y:0, z:10}, orientation: {x:0, y:0, z:0, w:1}},
       null, true, 'sun', {x: 0.5, y: 0.1, z: -0.9});

  this.add(obj);
};

GZ3D.Scene.prototype.setSDFParser = function(sdfParser)
{
  this.spawnModel.sdfParser = sdfParser;
};

/**
 * Window event callback
 * @param {} event - mousedown or touchdown events
 */
GZ3D.Scene.prototype.onPointerDown = function(event)
{
  event.preventDefault();

  if (this.spawnModel.active)
  {
    return;
  }

  var mainPointer = true;
  var pos;
  if (event.touches)
  {
    if (event.touches.length === 1)
    {
      pos = new THREE.Vector2(
          event.touches[0].clientX, event.touches[0].clientY);
    }
    else if (event.touches.length === 2)
    {
      pos = new THREE.Vector2(
          (event.touches[0].clientX + event.touches[1].clientX)/2,
          (event.touches[0].clientY + event.touches[1].clientY)/2);
    }
    else
    {
      return;
    }
  }
  else
  {
    pos = new THREE.Vector2(
          event.clientX, event.clientY);
    if (event.which !== 1)
    {
      mainPointer = false;
    }
  }

  var intersect = new THREE.Vector3();
  var model = this.getRayCastModel(pos, intersect);

  if (intersect)
  {
    this.controls.target = intersect;
  }

  // Cancel in case of multitouch
  if (event.touches && event.touches.length !== 1)
  {
    return;
  }

  // Manipulation modes
  // Model found
  if (model)
  {
    // Do nothing to the floor plane
    if (model.name === 'plane')
    {
      this.timeDown = new Date().getTime();
    }
    else if (this.modelManipulator.pickerNames.indexOf(model.name) >= 0)
    {
      // Do not attach manipulator to itself
    }
    // Attach manipulator to model
    else if (model.name !== '')
    {
      if (mainPointer && model.parent === this.scene)
      {
        this.selectEntity(model);
      }
    }
    // Manipulator pickers, for mouse
    else if (this.modelManipulator.hovered)
    {
      this.modelManipulator.update();
      this.modelManipulator.object.updateMatrixWorld();
    }
    // Sky
    else
    {
      this.timeDown = new Date().getTime();
    }
  }
  // Plane from below, for example
  else
  {
    this.timeDown = new Date().getTime();
  }
};

/**
 * Window event callback
 * @param {} event - mouseup or touchend events
 */
GZ3D.Scene.prototype.onPointerUp = function(event)
{
  event.preventDefault();

  // Clicks (<150ms) outside any models trigger view mode
  var millisecs = new Date().getTime();
  if (millisecs - this.timeDown < 150)
  {
    this.setManipulationMode('view');
    // TODO: Remove jquery from scene
    if (typeof GZ3D.Gui === 'function')
    {
      $( '#view-mode' ).click();
      $('input[type="radio"]').checkboxradio('refresh');
    }
  }
  this.timeDown = null;
};

/**
 * Window event callback
 * @param {} event - mousescroll event
 */
GZ3D.Scene.prototype.onMouseScroll = function(event)
{
  event.preventDefault();

  var pos = new THREE.Vector2(event.clientX, event.clientY);

  var intersect = new THREE.Vector3();
  var model = this.getRayCastModel(pos, intersect);

  if (intersect)
  {
    this.controls.target = intersect;
  }
};

/**
 * Window event callback
 * @param {} event - keydown events
 */
GZ3D.Scene.prototype.onKeyDown = function(event)
{
  if (event.shiftKey)
  {
    // + and - for zooming
    if (event.keyCode === 187 || event.keyCode === 189)
    {
      var pos = new THREE.Vector2(this.getDomElement().width/2.0,
          this.getDomElement().height/2.0);

      var intersect = new THREE.Vector3();
      var model = this.getRayCastModel(pos, intersect);

      if (intersect)
      {
        this.controls.target = intersect;
      }

      if (event.keyCode === 187)
      {
        this.controls.dollyOut();
      }
      else
      {
        this.controls.dollyIn();
      }
    }
  }

  // DEL to delete entities
  if (event.keyCode === 46)
  {
    if (this.selectedEntity)
    {
      this.emitter.emit('delete_entity');
    }
  }

  // F2 for turning on effects
  if (event.keyCode === 113)
  {
    this.effectsEnabled = !this.effectsEnabled;
  }

  // Esc/R/T for changing manipulation modes
  // TODO: Remove jquery from scene
  if (typeof GZ3D.Gui === 'function')
  {
    if (event.keyCode === 27) // Esc
    {
      $( '#view-mode' ).click();
      $('input[type="radio"]').checkboxradio('refresh');
    }
    if (event.keyCode === 82) // R
    {
      $( '#rotate-mode' ).click();
      $('input[type="radio"]').checkboxradio('refresh');
    }
    if (event.keyCode === 84) // T
    {
      $( '#translate-mode' ).click();
      $('input[type="radio"]').checkboxradio('refresh');
    }
  }
};

/**
 * Check if there's a model immediately under canvas coordinate 'pos'
 * @param {THREE.Vector2} pos - Canvas coordinates
 * @param {THREE.Vector3} intersect - Empty at input,
 * contains point of intersection in 3D world coordinates at output
 * @returns {THREE.Object3D} model - Intercepted model closest to the camera
 */
GZ3D.Scene.prototype.getRayCastModel = function(pos, intersect)
{
  var vector = new THREE.Vector3(
      ((pos.x - this.getDomElement().offsetLeft)
      / this.getDomElement().width) * 2 - 1,
      -((pos.y - this.getDomElement().offsetTop)
      / this.getDomElement().height) * 2 + 1, 1);
  vector.unproject(this.camera);
  var ray = new THREE.Raycaster( this.camera.position,
      vector.sub(this.camera.position).normalize() );

  var allObjects = [];
  this.scene.getDescendants(allObjects);
  var objects = ray.intersectObjects(allObjects);

  var model;
  var point;
  if (objects.length > 0)
  {
    modelsloop:
    for (var i = 0; i < objects.length; ++i)
    {
      model = objects[i].object;
      if (model.name.indexOf('_lightHelper') >= 0)
      {
        model = model.parent;
        break;
      }

      if (!this.modelManipulator.hovered &&
          (model.name === 'plane'))
      {
        // model = null;
        point = objects[i].point;
        break;
      }

      if (model.name === 'grid' || model.name === 'boundingBox' ||
          model.name === 'JOINT_VISUAL' || model.name === 'INERTIA_VISUAL'
	  || model.name === 'COM_VISUAL')
      {
        point = objects[i].point;
        model = null;
        continue;
      }

      while (model.parent !== this.scene)
      {
        // Select current mode's handle
        if (model.parent.parent === this.modelManipulator.gizmo &&
            ((this.manipulationMode === 'translate' &&
              model.name.indexOf('T') >=0) ||
             (this.manipulationMode === 'rotate' &&
               model.name.indexOf('R') >=0)))
        {
          break modelsloop;
        }
        model = model.parent;
      }

      if (this.radialMenu && model === this.radialMenu.menu)
      {
        continue;
      }

      if (model.name.indexOf('COLLISION_VISUAL') >= 0)
      {
        model = null;
        continue;
      }

      if (this.modelManipulator.hovered)
      {
        if (model === this.modelManipulator.gizmo)
        {
          break;
        }
      }
      else if (model.name !== '')
      {
        point = objects[i].point;
        break;
      }
    }
  }
  if (point)
  {
    intersect.x = point.x;
    intersect.y = point.y;
    intersect.z = point.z;
  }
  return model;
};

/**
 * Get the renderer's DOM element
 * @returns {domElement}
 */
GZ3D.Scene.prototype.getDomElement = function()
{
  return this.renderer.domElement;
};

/**
 * Render scene
 */
GZ3D.Scene.prototype.render = function()
{
  // Kill camera control when:
  // -manipulating
  // -using radial menu
  // -pointer over menus
  // -spawning
  if (this.modelManipulator.hovered ||
      (this.radialMenu && this.radialMenu.showing) ||
      this.pointerOnMenu ||
      this.spawnModel.active)
  {
    this.controls.enabled = false;
    this.controls.update();
  }
  else
  {
    this.controls.enabled = true;
    this.controls.update();
  }

  this.modelManipulator.update();
  if (this.radialMenu)
  {
    this.radialMenu.update();
  }

  this.renderer.clear();
  this.renderer.render(this.scene, this.camera);

  this.renderer.clearDepth();
  if (this.sceneOrtho && this.cameraOrtho)
  {
    this.renderer.render(this.sceneOrtho, this.cameraOrtho);
  }
};

/**
 * Set scene size.
 * @param {double} width
 * @param {double} height
 */
GZ3D.Scene.prototype.setSize = function(width, height)
{
  this.camera.aspect = width / height;
  this.camera.updateProjectionMatrix();

  if (this.cameraOrtho)
  {
    this.cameraOrtho.left = -width / 2;
    this.cameraOrtho.right = width / 2;
    this.cameraOrtho.top = height / 2;
    this.cameraOrtho.bottom = -height / 2;
    this.cameraOrtho.updateProjectionMatrix();
  }

  this.renderer.setSize(width, height);
  this.render();
};

/**
 * Add object to the scene
 * @param {THREE.Object3D} model
 */
GZ3D.Scene.prototype.add = function(model)
{
  model.viewAs = 'normal';
  this.scene.add(model);
};

/**
 * Remove object from the scene
 * @param {THREE.Object3D} model
 */
GZ3D.Scene.prototype.remove = function(model)
{
  this.scene.remove(model);
};

/**
 * Returns the object which has the given name
 * @param {string} name
 * @returns {THREE.Object3D} model
 */
GZ3D.Scene.prototype.getByName = function(name)
{
  return this.scene.getObjectByName(name);
};

/**
 * Update a model's pose
 * @param {THREE.Object3D} model
 * @param {} position
 * @param {} orientation
 */
GZ3D.Scene.prototype.updatePose = function(model, position, orientation)
{
  if (this.modelManipulator && this.modelManipulator.object &&
      this.modelManipulator.hovered)
  {
    return;
  }

  this.setPose(model, position, orientation);
};

/**
 * Set a model's pose
 * @param {THREE.Object3D} model
 * @param {} position
 * @param {} orientation
 */
GZ3D.Scene.prototype.setPose = function(model, position, orientation)
{
  model.position.x = position.x;
  model.position.y = position.y;
  model.position.z = position.z;
  model.quaternion.w = orientation.w;
  model.quaternion.x = orientation.x;
  model.quaternion.y = orientation.y;
  model.quaternion.z = orientation.z;
};

GZ3D.Scene.prototype.removeAll = function()
{
  while(this.scene.children.length > 0)
  {
    this.scene.remove(this.scene.children[0]);
  }
};

/**
 * Create plane
 * @param {double} normalX
 * @param {double} normalY
 * @param {double} normalZ
 * @param {double} width
 * @param {double} height
 * @returns {THREE.Mesh}
 */
GZ3D.Scene.prototype.createPlane = function(normalX, normalY, normalZ,
    width, height)
{
  var geometry = new THREE.PlaneGeometry(width, height, 1, 1);
  var material =  new THREE.MeshPhongMaterial();
  var mesh = new THREE.Mesh(geometry, material);
  var normal = new THREE.Vector3(normalX, normalY, normalZ);
  var cross = normal.crossVectors(normal, mesh.up);
  mesh.rotation = normal.applyAxisAngle(cross, -(normal.angleTo(mesh.up)));
  mesh.name = 'plane';
  mesh.receiveShadow = true;
  return mesh;
};

/**
 * Create sphere
 * @param {double} radius
 * @returns {THREE.Mesh}
 */
GZ3D.Scene.prototype.createSphere = function(radius)
{
  var geometry = new THREE.SphereGeometry(radius, 32, 32);
  var mesh = new THREE.Mesh(geometry, this.simpleShapesMaterial);
  return mesh;
};

/**
 * Create cylinder
 * @param {double} radius
 * @param {double} length
 * @returns {THREE.Mesh}
 */
GZ3D.Scene.prototype.createCylinder = function(radius, length)
{
  var geometry = new THREE.CylinderGeometry(radius, radius, length, 32, 1,
      false);
  var mesh = new THREE.Mesh(geometry, this.simpleShapesMaterial);
  mesh.rotation.x = Math.PI * 0.5;
  return mesh;
};

/**
 * Create box
 * @param {double} width
 * @param {double} height
 * @param {double} depth
 * @returns {THREE.Mesh}
 */
GZ3D.Scene.prototype.createBox = function(width, height, depth)
{
  var geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);

  // Fix UVs so textures are mapped in a way that is consistent to gazebo
  // Some face uvs need to be rotated clockwise, while others anticlockwise
  // After updating to threejs rev 62, geometries changed from quads (6 faces)
  // to triangles (12 faces).
  geometry.dynamic = true;
  var faceUVFixA = [1, 4, 5];
  var faceUVFixB = [0];
  for (var i = 0; i < faceUVFixA.length; ++i)
  {
    var idx = faceUVFixA[i]*2;
    var uva = geometry.faceVertexUvs[0][idx][0];
    geometry.faceVertexUvs[0][idx][0] = geometry.faceVertexUvs[0][idx][1];
    geometry.faceVertexUvs[0][idx][1] = geometry.faceVertexUvs[0][idx+1][1];
    geometry.faceVertexUvs[0][idx][2] = uva;

    geometry.faceVertexUvs[0][idx+1][0] = geometry.faceVertexUvs[0][idx+1][1];
    geometry.faceVertexUvs[0][idx+1][1] = geometry.faceVertexUvs[0][idx+1][2];
    geometry.faceVertexUvs[0][idx+1][2] = geometry.faceVertexUvs[0][idx][2];
  }
  for (var ii = 0; ii < faceUVFixB.length; ++ii)
  {
    var idxB = faceUVFixB[ii]*2;
    var uvc = geometry.faceVertexUvs[0][idxB][0];
    geometry.faceVertexUvs[0][idxB][0] = geometry.faceVertexUvs[0][idxB][2];
    geometry.faceVertexUvs[0][idxB][1] = uvc;
    geometry.faceVertexUvs[0][idxB][2] =  geometry.faceVertexUvs[0][idxB+1][1];

    geometry.faceVertexUvs[0][idxB+1][2] = geometry.faceVertexUvs[0][idxB][2];
    geometry.faceVertexUvs[0][idxB+1][1] = geometry.faceVertexUvs[0][idxB+1][0];
    geometry.faceVertexUvs[0][idxB+1][0] = geometry.faceVertexUvs[0][idxB][1];
  }
  geometry.uvsNeedUpdate = true;

  var mesh = new THREE.Mesh(geometry, this.simpleShapesMaterial);
  mesh.castShadow = true;
  return mesh;
};

/**
 * Create light
 * @param {} type - 1: point, 2: spot, 3: directional
 * @param {} diffuse
 * @param {} intensity
 * @param {} pose
 * @param {} distance
 * @param {} cast_shadows
 * @param {} name
 * @param {} direction
 * @param {} specular
 * @param {} attenuation_constant
 * @param {} attenuation_linear
 * @param {} attenuation_quadratic
 * @returns {THREE.Object3D}
 */
GZ3D.Scene.prototype.createLight = function(type, diffuse, intensity, pose,
    distance, cast_shadows, name, direction, specular, attenuation_constant,
    attenuation_linear, attenuation_quadratic)
{
  var obj = new THREE.Object3D();
  var color = new THREE.Color();

  if (typeof(diffuse) === 'undefined')
  {
    diffuse = 0xffffff;
  }
  else if (typeof(diffuse) !== THREE.Color)
  {
    color.r = diffuse.r;
    color.g = diffuse.g;
    color.b = diffuse.b;
    diffuse = color.clone();
  }
  else if (typeof(specular) !== THREE.Color)
  {
    color.r = specular.r;
    color.g = specular.g;
    color.b = specular.b;
    specular = color.clone();
  }

  if (pose)
  {
    this.setPose(obj, pose.position, pose.orientation);
    obj.matrixWorldNeedsUpdate = true;
  }

  var elements;
  if (type === 1)
  {
    elements = this.createPointLight(obj, diffuse, intensity,
        distance, cast_shadows);
  }
  else if (type === 2)
  {
    elements = this.createSpotLight(obj, diffuse, intensity,
        distance, cast_shadows);
  }
  else if (type === 3)
  {
    elements = this.createDirectionalLight(obj, diffuse, intensity,
        cast_shadows);
  }

  var lightObj = elements[0];
  var helper = elements[1];

  if (name)
  {
    lightObj.name = name;
    obj.name = name;
    helper.name = name + '_lightHelper';
  }

  var dir = new THREE.Vector3(0, 0, -1);
  if (direction)
  {
    dir.x = direction.x;
    dir.y = direction.y;
    dir.z = direction.z;
  }
  obj.direction = new THREE.Vector3(dir.x, dir.y, dir.z);

  var targetObj = new THREE.Object3D();
  lightObj.add(targetObj);

  targetObj.position.copy(dir);
  targetObj.matrixWorldNeedsUpdate = true;
  lightObj.target = targetObj;

  // Add properties which exist on the server but have no meaning on THREE.js
  obj.serverProperties = {};
  obj.serverProperties.specular = specular;
  obj.serverProperties.attenuation_constant = attenuation_constant;
  obj.serverProperties.attenuation_linear = attenuation_linear;
  obj.serverProperties.attenuation_quadratic = attenuation_quadratic;

  obj.add(lightObj);
  obj.add(helper);
  return obj;
};

/**
 * Create point light - called by createLight
 * @param {} obj - light object
 * @param {} color
 * @param {} intensity
 * @param {} distance
 * @param {} cast_shadows
 * @returns {Object.<THREE.Light, THREE.Mesh>}
 */
GZ3D.Scene.prototype.createPointLight = function(obj, color, intensity,
    distance, cast_shadows)
{
  if (typeof(intensity) === 'undefined')
  {
    intensity = 0.5;
  }

  var lightObj = new THREE.PointLight(color, intensity);

  if (distance)
  {
    lightObj.distance = distance;
  }
  if (cast_shadows)
  {
    lightObj.castShadow = cast_shadows;
  }

  var helperGeometry = new THREE.OctahedronGeometry(0.25, 0);
  helperGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI/2));
  var helperMaterial = new THREE.MeshBasicMaterial(
        {wireframe: true, color: 0x00ff00});
  var helper = new THREE.Mesh(helperGeometry, helperMaterial);

  return [lightObj, helper];
};

/**
 * Create spot light - called by createLight
 * @param {} obj - light object
 * @param {} color
 * @param {} intensity
 * @param {} distance
 * @param {} cast_shadows
 * @returns {Object.<THREE.Light, THREE.Mesh>}
 */
GZ3D.Scene.prototype.createSpotLight = function(obj, color, intensity,
    distance, cast_shadows)
{
  if (typeof(intensity) === 'undefined')
  {
    intensity = 1;
  }
  if (typeof(distance) === 'undefined')
  {
    distance = 20;
  }

  var lightObj = new THREE.SpotLight(color, intensity);
  lightObj.distance = distance;
  lightObj.position.set(0,0,0);

  if (cast_shadows)
  {
    lightObj.castShadow = cast_shadows;
  }

  var helperGeometry = new THREE.CylinderGeometry(0, 0.3, 0.2, 4, 1, true);
  helperGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI/2));
  helperGeometry.applyMatrix(new THREE.Matrix4().makeRotationZ(Math.PI/4));
  var helperMaterial = new THREE.MeshBasicMaterial(
        {wireframe: true, color: 0x00ff00});
  var helper = new THREE.Mesh(helperGeometry, helperMaterial);

  return [lightObj, helper];

};

/**
 * Create directional light - called by createLight
 * @param {} obj - light object
 * @param {} color
 * @param {} intensity
 * @param {} cast_shadows
 * @returns {Object.<THREE.Light, THREE.Mesh>}
 */
GZ3D.Scene.prototype.createDirectionalLight = function(obj, color, intensity,
    cast_shadows)
{
  if (typeof(intensity) === 'undefined')
  {
    intensity = 1;
  }

  var lightObj = new THREE.DirectionalLight(color, intensity);
  lightObj.shadow.camera.near = 1;
  lightObj.shadow.camera.far = 50;
  lightObj.shadow.mapSize.width = 4094;
  lightObj.shadow.mapSize.height = 4094;
  lightObj.shadow.camera.bottom = -100;
  lightObj.shadow.camera.feft = -100;
  lightObj.shadow.camera.right = 100;
  lightObj.shadow.camera.top = 100;
  lightObj.shadow.bias = 0.0001;
  lightObj.position.set(0,0,0);

  if (cast_shadows)
  {
    lightObj.castShadow = cast_shadows;
  }

  var helperGeometry = new THREE.Geometry();
  helperGeometry.vertices.push(new THREE.Vector3(-0.5, -0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3(-0.5,  0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3(-0.5,  0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3( 0.5,  0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3( 0.5,  0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3( 0.5, -0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3( 0.5, -0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3(-0.5, -0.5, 0));
  helperGeometry.vertices.push(new THREE.Vector3(   0,    0, 0));
  helperGeometry.vertices.push(new THREE.Vector3(   0,    0, -0.5));
  var helperMaterial = new THREE.LineBasicMaterial({color: 0x00ff00});
  var helper = new THREE.Line(helperGeometry, helperMaterial,
      THREE.LineSegments);

  return [lightObj, helper];
};

/**
 * Create roads
 * @param {} points
 * @param {} width
 * @param {} texture
 * @returns {THREE.Mesh}
 */
GZ3D.Scene.prototype.createRoads = function(points, width, texture)
{
  var geometry = new THREE.Geometry();
  geometry.dynamic = true;
  var texCoord = 0.0;
  var texMaxLen = width;
  var factor = 1.0;
  var curLen = 0.0;
  var tangent = new THREE.Vector3(0,0,0);
  var pA;
  var pB;
  var prevPt = new THREE.Vector3(0,0,0);
  var prevTexCoord;
  var texCoords = [];
  var j = 0;
  for (var i = 0; i < points.length; ++i)
  {
    var pt0 =  new THREE.Vector3(points[i].x, points[i].y,
        points[i].z);
    var pt1;
    if (i !== points.length - 1)
    {
      pt1 =  new THREE.Vector3(points[i+1].x, points[i+1].y,
          points[i+1].z);
    }
    factor = 1.0;
    if (i > 0)
    {
      curLen += pt0.distanceTo(prevPt);
    }
    texCoord = curLen/texMaxLen;
    if (i === 0)
    {
      tangent.x = pt1.x;
      tangent.y = pt1.y;
      tangent.z = pt1.z;
      tangent.sub(pt0);
      tangent.normalize();
    }
    else if (i === points.length - 1)
    {
      tangent.x = pt0.x;
      tangent.y = pt0.y;
      tangent.z = pt0.z;
      tangent.sub(prevPt);
      tangent.normalize();
    }
    else
    {
      var v0 = new THREE.Vector3(0,0,0);
      var v1 = new THREE.Vector3(0,0,0);
      v0.x = pt0.x;
      v0.y = pt0.y;
      v0.z = pt0.z;
      v0.sub(prevPt);
      v0.normalize();

      v1.x = pt1.x;
      v1.y = pt1.y;
      v1.z = pt1.z;
      v1.sub(pt0);
      v1.normalize();

      var dot = v0.dot(v1*-1);

      tangent.x = pt1.x;
      tangent.y = pt1.y;
      tangent.z = pt1.z;
      tangent.sub(prevPt);
      tangent.normalize();

      if (dot > -0.97 && dot < 0.97)
      {
        factor = 1.0 / Math.sin(Math.acos(dot) * 0.5);
      }
    }
    var theta = Math.atan2(tangent.x, -tangent.y);
    pA = new THREE.Vector3(pt0.x,pt0.y,pt0.z);
    pB = new THREE.Vector3(pt0.x,pt0.y,pt0.z);
    var w = (width * factor)*0.5;
    pA.x += Math.cos(theta) * w;
    pA.y += Math.sin(theta) * w;
    pB.x -= Math.cos(theta) * w;
    pB.y -= Math.sin(theta) * w;

    geometry.vertices.push(pA);
    geometry.vertices.push(pB);

    texCoords.push([0, texCoord]);
    texCoords.push([1, texCoord]);

    // draw triangle strips
    if (i > 0)
    {
      geometry.faces.push(new THREE.Face3(j, j+1, j+2,
        new THREE.Vector3(0, 0, 1)));
      geometry.faceVertexUvs[0].push(
          [new THREE.Vector2(texCoords[j][0], texCoords[j][1]),
           new THREE.Vector2(texCoords[j+1][0], texCoords[j+1][1]),
           new THREE.Vector2(texCoords[j+2][0], texCoords[j+2][1])]);
      j++;

      geometry.faces.push(new THREE.Face3(j, j+2, j+1,
        new THREE.Vector3(0, 0, 1)));
      geometry.faceVertexUvs[0].push(
          [new THREE.Vector2(texCoords[j][0], texCoords[j][1]),
           new THREE.Vector2(texCoords[j+2][0], texCoords[j+2][1]),
           new THREE.Vector2(texCoords[j+1][0], texCoords[j+1][1])]);
      j++;

    }

    prevPt.x = pt0.x;
    prevPt.y = pt0.y;
    prevPt.z = pt0.z;

    prevTexCoord = texCoord;
  }

  // geometry.computeTangents();
  geometry.computeFaceNormals();

  geometry.verticesNeedUpdate = true;
  geometry.uvsNeedUpdate = true;


  var material =  new THREE.MeshPhongMaterial();

 /* var ambient = mat['ambient'];
  if (ambient)
  {
    material.ambient.setRGB(ambient[0], ambient[1], ambient[2]);
  }
  var diffuse = mat['diffuse'];
  if (diffuse)
  {
    material.color.setRGB(diffuse[0], diffuse[1], diffuse[2]);
  }
  var specular = mat['specular'];
  if (specular)
  {
    material.specular.setRGB(specular[0], specular[1], specular[2]);
  }*/
  if (texture)
  {
    var tex = this.textureLoader.load(texture);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    material.map = tex;
  }

  var mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
};

/**
 * Load heightmap
 * @param {} heights Lookup table of heights
 * @param {} width Width in meters
 * @param {} height Height in meters
 * @param {} segmentWidth Size of lookup table
 * @param {} segmentHeight Size of lookup table
 * @param {} origin Heightmap position in the world
 * @param {} textures
 * @param {} blends
 * @param {} parent
 */
GZ3D.Scene.prototype.loadHeightmap = function(heights, width, height,
    segmentWidth, segmentHeight, origin, textures, blends, parent)
{
  if (this.heightmap)
  {
    console.log('Only one heightmap can be loaded at a time');
    return;
  }

  if (parent === undefined)
  {
    console.error('Missing parent, heightmap won\'t be loaded.');
    return;
  }

  // unfortunately large heightmaps kill the fps and freeze everything so
  // we have to scale it down
  var scale = 1;
  var maxHeightmapWidth = 256;
  var maxHeightmapHeight = 256;

  if ((segmentWidth-1) > maxHeightmapWidth)
  {
    scale = maxHeightmapWidth / (segmentWidth-1);
  }

  var geometry = new THREE.PlaneGeometry(width, height,
      (segmentWidth-1) * scale, (segmentHeight-1) * scale);
  geometry.dynamic = true;

  // Mirror the vertices about the X axis
  var vertices = [];
  for (var h = segmentHeight-1; h >= 0; --h)
  {
    for (var w = 0; w < segmentWidth; ++w)
    {
      vertices[(segmentHeight-h-1)*segmentWidth  + w]
          = heights[h*segmentWidth + w];
    }
  }

  // Sub-sample
  var col = (segmentWidth-1) * scale;
  var row = (segmentHeight-1) * scale;
  for (var r = 0; r < row; ++r)
  {
    for (var c = 0; c < col; ++c)
    {
      var index = (r * col * 1/(scale*scale)) +   (c * (1/scale));
      geometry.vertices[r*col + c].z = vertices[index];
    }
  }

  // Compute normals
  geometry.computeFaceNormals();
  geometry.computeVertexNormals();

  // Material - use shader if textures provided, otherwise use a generic phong
  // material
  var material;
  if (textures && textures.length > 0)
  {
    var textureLoaded = [];
    var repeats = [];
    for (var t = 0; t < textures.length; ++t)
    {
      textureLoaded[t] = this.textureLoader.load(textures[t].diffuse);
      textureLoaded[t].wrapS = THREE.RepeatWrapping;
      textureLoaded[t].wrapT = THREE.RepeatWrapping;
      repeats[t] = width/textures[t].size;
    }

    // for now, use fixed no. of textures and blends
    // so populate the remaining ones to make the fragment shader happy
    for (var tt = textures.length; tt< 3; ++tt)
    {
      textureLoaded[tt] = textureLoaded[tt-1];
    }

    for (var b = blends.length; b < 2; ++b)
    {
      blends[b] = blends[b-1];
    }

    for (var rr = repeats.length; rr < 3; ++rr)
    {
      repeats[rr] = repeats[rr-1];
    }

    // Use the same approach as gazebo scene, grab the first directional light
    // and use it for shading the terrain
    var lightDir = new THREE.Vector3(0, 0, 1);
    var lightDiffuse = new THREE.Color(0xffffff);
    var allObjects = [];
    this.scene.getDescendants(allObjects);
    for (var l = 0; l < allObjects.length; ++l)
    {
      if (allObjects[l] instanceof THREE.DirectionalLight)
      {
        lightDir = allObjects[l].target.position;
        lightDiffuse = allObjects[l].color;
        break;
      }
    }

    var options = {
      uniforms:
      {
        texture0: { type: 't', value: textureLoaded[0]},
        texture1: { type: 't', value: textureLoaded[1]},
        texture2: { type: 't', value: textureLoaded[2]},
        repeat0: { type: 'f', value: repeats[0]},
        repeat1: { type: 'f', value: repeats[1]},
        repeat2: { type: 'f', value: repeats[2]},
        minHeight1: { type: 'f', value: blends[0].min_height},
        fadeDist1: { type: 'f', value: blends[0].fade_dist},
        minHeight2: { type: 'f', value: blends[1].min_height},
        fadeDist2: { type: 'f', value: blends[1].fade_dist},
        ambient: { type: 'c', value: this.ambient.color},
        lightDiffuse: { type: 'c', value: lightDiffuse},
        lightDir: { type: 'v3', value: lightDir}
      },
    };

    if (this.shaders !== undefined)
    {
      options.vertexShader = this.shaders.heightmapVS;
      options.fragmentShader = this.shaders.heightmapFS;
    }
    else
    {
      console.log('Warning: heightmap shaders not provided.');
    }

    material = new THREE.ShaderMaterial(options);
  }
  else
  {
    material = new THREE.MeshPhongMaterial( { color: 0x555555 } );
  }

  var mesh = new THREE.Mesh(geometry, material);

  mesh.position.x = origin.x;
  mesh.position.y = origin.y;
  mesh.position.z = origin.z;
  parent.add(mesh);

  this.heightmap = parent;
};

/* eslint-disable */
/**
 * Load mesh
 * @example
 * // loading using URI
 * // callback(mesh)
 * loadMeshFromUri('assets/house_1/meshes/house_1.dae', undefined, undefined, function(mesh)
            {
              // use the mesh
            });
 * @param {string} uri
 * @param {} submesh
 * @param {} centerSubmesh
 * @param {function} callback
 */
/* eslint-enable */
GZ3D.Scene.prototype.loadMeshFromUri = function(uri, submesh, centerSubmesh,
  callback)
{
  var uriPath = uri.substring(0, uri.lastIndexOf('/'));
  var uriFile = uri.substring(uri.lastIndexOf('/') + 1);

  if (this.meshes[uri])
  {
    var mesh = this.meshes[uri];
    mesh = mesh.clone();
    this.useSubMesh(mesh, submesh, centerSubmesh);
    this.saveModelTransformInfo(mesh, uri);
    callback(mesh);
    return;
  }

  // load meshes
  if (uriFile.substr(-4).toLowerCase() === '.dae')
  {
    return this.loadCollada(uri, submesh, centerSubmesh, callback);
  }
  else if (uriFile.substr(-4).toLowerCase() === '.obj')
  {
    var gzObjLoader = new GZ3D.OBJLoader(this, uri, submesh, centerSubmesh,
        callback);
    return gzObjLoader.loadOBJ();
  }
  else if (uriFile.substr(-4).toLowerCase() === '.stl')
  {
    return this.loadSTL(uri, submesh, centerSubmesh, callback);
  }
  else if (uriFile.substr(-5).toLowerCase() === '.urdf')
  {
    console.error('Attempting to load URDF file, but it\'s not supported.');
    /*var urdfModel = new ROSLIB.UrdfModel({
      string : uri
    });

    // adapted from ros3djs
    var links = urdfModel.links;
    for ( var l in links) {
      var link = links[l];
      if (link.visual && link.visual.geometry) {
        if (link.visual.geometry.type === ROSLIB.URDF_MESH) {
          var frameID = '/' + link.name;
          var filename = link.visual.geometry.filename;
          var meshType = filename.substr(-4).toLowerCase();
          var mesh = filename.substring(filename.indexOf('://') + 3);
          // ignore mesh files which are not in Collada format
          if (meshType === '.dae')
          {
            var dae = this.loadCollada(uriPath + '/' + mesh, parent);
            // check for a scale
            if(link.visual.geometry.scale)
            {
              dae.scale = new THREE.Vector3(
                  link.visual.geometry.scale.x,
                  link.visual.geometry.scale.y,
                  link.visual.geometry.scale.z
              );
            }
          }
        }
      }
    }*/
  }
};

/* eslint-disable */
/**
 * Load mesh
 * @example
 * // loading using URI
 * // callback(mesh)
 * @example
 * // loading using file string
 * // callback(mesh)
 * loadMeshFromString('assets/house_1/meshes/house_1.dae', undefined, undefined, function(mesh)
            {
              // use the mesh
            }, ['<?xml version="1.0" encoding="utf-8"?>
    <COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
      <asset>
        <contributor>
          <author>Cole</author>
          <authoring_tool>OpenCOLLADA for 3ds Max;  Ver.....']);
 * @param {string} uri
 * @param {} submesh
 * @param {} centerSubmesh
 * @param {function} callback
 * @param {array} files - files needed by the loaders[dae] in case of a collada
 * mesh, [obj, mtl] in case of object mesh, all as strings
 */
/* eslint-enable */
GZ3D.Scene.prototype.loadMeshFromString = function(uri, submesh, centerSubmesh,
  callback, files)
{
  var uriPath = uri.substring(0, uri.lastIndexOf('/'));
  var uriFile = uri.substring(uri.lastIndexOf('/') + 1);

  if (this.meshes[uri])
  {
    var mesh = this.meshes[uri];
    mesh = mesh.clone();
    this.useSubMesh(mesh, submesh, centerSubmesh);
    this.saveModelTransformInfo(mesh, uri);
    callback(mesh);
    return;
  }

  // load mesh
  if (uriFile.substr(-4).toLowerCase() === '.dae')
  {
    // loadCollada just accepts one file, which is the dae file as string
    if (files.length < 1 || !files[0])
    {
      console.error('Missing DAE file');
      return;
    }
    return this.loadCollada(uri, submesh, centerSubmesh, callback, files[0]);
  }
  else if (uriFile.substr(-4).toLowerCase() === '.obj')
  {
    if (files.length < 2 || !files[0] || !files[1])
    {
      console.error('Missing either OBJ or MTL file');
      return;
    }
    var gzObjLoader = new GZ3D.OBJLoader(this, uri, submesh, centerSubmesh,
        callback, files);
    return gzObjLoader.loadOBJ();
  }
};

/**
 * Load collada file
 * @param {string} uri - mesh uri which is used by colldaloader to load
 * the mesh file using an XMLHttpRequest.
 * @param {} submesh
 * @param {} centerSubmesh
 * @param {function} callback
 * @param {string} filestring -optional- the mesh file as a string to be parsed
 * if provided the uri will not be used just as a url, no XMLHttpRequest will
 * be made.
 */
GZ3D.Scene.prototype.loadCollada = function(uri, submesh, centerSubmesh,
  callback, filestring)
{
  var dae;
  var mesh = null;
  var that = this;

  /*
  // Crashes: issue #36
  if (this.meshes[uri])
  {
    dae = this.meshes[uri];
    dae = dae.clone();
    this.useColladaSubMesh(dae, submesh, centerSubmesh);
    callback(dae);
    return;
  }
  */

  if (!filestring)
  {
    this.colladaLoader.load(uri, function(collada)
    {
      meshReady(collada);
    });
  }
  else
  {
    this.colladaLoader.parse(filestring, function(collada)
    {
      meshReady(collada);
    }, undefined);
  }

  function meshReady(collada)
  {
    // check for a scale factor
    /*if(collada.dae.asset.unit)
    {
      var scale = collada.dae.asset.unit;
      collada.scene.scale = new THREE.Vector3(scale, scale, scale);
    }*/

    dae = collada.scene;
    dae.updateMatrix();
    that.prepareColladaMesh(dae);
    that.meshes[uri] = dae;
    dae = dae.clone();
    that.useSubMesh(dae, submesh, centerSubmesh);

    dae.name = uri;
    callback(dae);
  }
};

/**
 * Prepare collada by removing other non-mesh entities such as lights
 * @param {} dae
 */
GZ3D.Scene.prototype.prepareColladaMesh = function(dae)
{
  var allChildren = [];
  dae.getDescendants(allChildren);
  for (var i = 0; i < allChildren.length; ++i)
  {
    if (allChildren[i] instanceof THREE.Light)
    {
      allChildren[i].parent.remove(allChildren[i]);
    }
  }
};

/**
 * Prepare mesh by handling submesh-only loading
 * @param {} mesh
 * @param {} submesh
 * @param {} centerSubmesh
 * @returns {THREE.Mesh} mesh
 */
GZ3D.Scene.prototype.useSubMesh = function(mesh, submesh, centerSubmesh)
{
  if (!submesh)
  {
    return null;
  }

  var result;
  var allChildren = [];
  mesh.getDescendants(allChildren);
  for (var i = 0; i < allChildren.length; ++i)
  {
    if (allChildren[i] instanceof THREE.Mesh)
    {
      if (allChildren[i].name === submesh ||
          allChildren[i].geometry.name === submesh)
      {
        if (centerSubmesh)
        {
          // obj
          if (allChildren[i].geometry instanceof THREE.BufferGeometry)
          {
            var geomPosition = allChildren[i].geometry.attributes.position;
            var dim = geomPosition.itemSize;
            var minPos = [];
            var maxPos = [];
            var centerPos = [];
            var m = 0;
            for (m = 0; m < dim; ++m)
            {
              minPos[m] = geomPosition.array[m];
              maxPos[m] = minPos[m];
            }
            var kk = 0;
            for (kk = dim; kk < geomPosition.count * dim; kk+=dim)
            {
              for (m = 0; m < dim; ++m)
              {
                minPos[m] = Math.min(minPos[m], geomPosition.array[kk + m]);
                maxPos[m] = Math.max(maxPos[m], geomPosition.array[kk + m]);
              }
            }

            for (m = 0; m < dim; ++m)
            {
              centerPos[m] = minPos[m] + (0.5 * (maxPos[m] - minPos[m]));
            }

            for (kk = 0; kk < geomPosition.count * dim; kk+=dim)
            {
              for (m = 0; m < dim; ++m)
              {
                geomPosition.array[kk + m] -= centerPos[m];
              }
            }
            allChildren[i].geometry.attributes.position.needsUpdate = true;
          }
          // dae
          else
          {
            var vertices = allChildren[i].geometry.vertices;
            var vMin = new THREE.Vector3();
            var vMax = new THREE.Vector3();
            vMin.x = vertices[0].x;
            vMin.y = vertices[0].y;
            vMin.z = vertices[0].z;
            vMax.x = vMin.x;
            vMax.y = vMin.y;
            vMax.z = vMin.z;

            for (var j = 1; j < vertices.length; ++j)
            {
              vMin.x = Math.min(vMin.x, vertices[j].x);
              vMin.y = Math.min(vMin.y, vertices[j].y);
              vMin.z = Math.min(vMin.z, vertices[j].z);
              vMax.x = Math.max(vMax.x, vertices[j].x);
              vMax.y = Math.max(vMax.y, vertices[j].y);
              vMax.z = Math.max(vMax.z, vertices[j].z);
            }

            var center  = new THREE.Vector3();
            center.x = vMin.x + (0.5 * (vMax.x - vMin.x));
            center.y = vMin.y + (0.5 * (vMax.y - vMin.y));
            center.z = vMin.z + (0.5 * (vMax.z - vMin.z));

            for (var k = 0; k < vertices.length; ++k)
            {
              vertices[k].x -= center.x;
              vertices[k].y -= center.y;
              vertices[k].z -= center.z;
            }

            allChildren[i].geometry.verticesNeedUpdate = true;
            var p = allChildren[i].parent;
            while (p)
            {
              p.position.set(0, 0, 0);
              p = p.parent;
            }
          }
        }
        result = allChildren[i];
      }
      else
      {
        allChildren[i].parent.remove(allChildren[i]);
      }
    }
  }
  return result;
};

/**
 * Load stl file.
 * Loads stl mesh given using it's uri
 * @param {string} uri
 * @param {} submesh
 * @param {} centerSubmesh
 * @param {function} callback
 */
GZ3D.Scene.prototype.loadSTL = function(uri, submesh, centerSubmesh,
  callback)
{
  var mesh = null;
  var that = this;
  this.stlLoader.load(uri, function(geometry)
  {
    mesh = new THREE.Mesh( geometry );
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    that.meshes[uri] = mesh;
    mesh = mesh.clone();
    that.useSubMesh(mesh, submesh, centerSubmesh);

    mesh.name = uri;
    callback(mesh);
  });
};

/**
 * Set material for an object
 * @param {} obj
 * @param {} material
 */
GZ3D.Scene.prototype.setMaterial = function(obj, material)
{
  if (obj)
  {
    if (material)
    {
      obj.material = new THREE.MeshPhongMaterial();
      var ambient = material.ambient;
      var diffuse = material.diffuse;
      if (diffuse)
      {
        // threejs removed ambient from phong and lambert materials so
        // aproximate the resulting color by mixing ambient and diffuse
        var dc = [];
        dc[0] = diffuse[0];
        dc[1] = diffuse[1];
        dc[2] = diffuse[2];
        if (ambient)
        {
          var a = 0.4;
          var d = 0.6;
          dc[0] = ambient[0]*a + diffuse[0]*d;
          dc[1] = ambient[1]*a + diffuse[1]*d;
          dc[2] = ambient[2]*a + diffuse[2]*d;
        }
        obj.material.color.setRGB(dc[0], dc[1], dc[2]);
      }
      var specular = material.specular;
      if (specular)
      {
        obj.material.specular.setRGB(specular[0], specular[1], specular[2]);
      }
      var opacity = material.opacity;
      if (opacity)
      {
        if (opacity < 1)
        {
          obj.material.transparent = true;
          obj.material.opacity = opacity;
        }
      }

      if (material.texture)
      {
        var texture = this.textureLoader.load(material.texture);
        if (material.scale)
        {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.x = 1.0 / material.scale[0];
          texture.repeat.y = 1.0 / material.scale[1];
        }
        obj.material.map = texture;
      }
      if (material.normalMap)
      {
        obj.material.normalMap =
            this.textureLoader.load(material.normalMap);
      }
    }
  }
};

/**
 * Set manipulation mode (view/translate/rotate)
 * @param {string} mode
 */
GZ3D.Scene.prototype.setManipulationMode = function(mode)
{
  this.manipulationMode = mode;

  if (mode === 'view')
  {
    if (this.modelManipulator.object)
    {
      this.emitter.emit('entityChanged', this.modelManipulator.object);
    }
    this.selectEntity(null);
  }
  else
  {
    // Toggle manipulaion space (world / local)
    if (this.modelManipulator.mode === this.manipulationMode)
    {
      this.modelManipulator.space =
        (this.modelManipulator.space === 'world') ? 'local' : 'world';
    }
    this.modelManipulator.mode = this.manipulationMode;
    this.modelManipulator.setMode(this.modelManipulator.mode);
    // model was selected during view mode
    if (this.selectedEntity)
    {
      this.selectEntity(this.selectedEntity);
    }
  }

};

/**
 * Show collision visuals
 * @param {boolean} show
 */
GZ3D.Scene.prototype.showCollision = function(show)
{
  if (show === this.showCollisions)
  {
    return;
  }

  var allObjects = [];
  this.scene.getDescendants(allObjects);
  for (var i = 0; i < allObjects.length; ++i)
  {
    if (allObjects[i] instanceof THREE.Object3D &&
        allObjects[i].name.indexOf('COLLISION_VISUAL') >=0)
    {
      var allChildren = [];
      allObjects[i].getDescendants(allChildren);
      for (var j =0; j < allChildren.length; ++j)
      {
        if (allChildren[j] instanceof THREE.Mesh)
        {
          allChildren[j].visible = show;
        }
      }
    }
  }
  this.showCollisions = show;

};

/**
 * Attach manipulator to an object
 * @param {THREE.Object3D} model
 * @param {string} mode (translate/rotate)
 */
GZ3D.Scene.prototype.attachManipulator = function(model,mode)
{
  if (this.modelManipulator.object)
  {
    this.emitter.emit('entityChanged', this.modelManipulator.object);
  }

  if (mode !== 'view')
  {
    this.modelManipulator.attach(model);
    this.modelManipulator.mode = mode;
    this.modelManipulator.setMode( this.modelManipulator.mode );
    this.scene.add(this.modelManipulator.gizmo);
  }
};

/**
 * Reset view
 */
GZ3D.Scene.prototype.resetView = function()
{
  this.camera.position.copy(this.defaultCameraPosition);
  this.camera.up = new THREE.Vector3(0, 0, 1);
  this.camera.lookAt(new THREE.Vector3( 0, 0, 0 ));
  this.camera.updateMatrix();
};

/**
 * Show radial menu
 * @param {} event
 */
GZ3D.Scene.prototype.showRadialMenu = function(e)
{
  if (!this.radialMenu)
  {
    return;
  }

  var event = e.originalEvent;

  var pointer = event.touches ? event.touches[ 0 ] : event;
  var pos = new THREE.Vector2(pointer.clientX, pointer.clientY);

  var intersect = new THREE.Vector3();
  var model = this.getRayCastModel(pos, intersect);

  if (model && model.name !== '' && model.name !== 'plane'
      && this.modelManipulator.pickerNames.indexOf(model.name) === -1)
  {
    this.radialMenu.show(event,model);
    this.selectEntity(model);
  }
};

/**
 * Sets the bounding box of an object while ignoring the addtional visuals.
 * @param {THREE.Box3} - box
 * @param {THREE.Object3D} - object
 */
GZ3D.Scene.prototype.setFromObject = function(box, object)
{
  box.min.x = box.min.y = box.min.z = + Infinity;
  box.max.x = box.max.y = box.max.z = - Infinity;
  var v = new THREE.Vector3();
  object.updateMatrixWorld( true );

  object.traverse( function ( node )
  {
    var i, l;
    var geometry = node.geometry;
    if ( geometry !== undefined )
    {

      if (node.name !== 'INERTIA_VISUAL' && node.name !== 'COM_VISUAL')
      {

        if ( geometry.isGeometry )
        {

          var vertices = geometry.vertices;

          for ( i = 0, l = vertices.length; i < l; i ++ )
          {

            v.copy( vertices[ i ] );
            v.applyMatrix4( node.matrixWorld );

            expandByPoint( v );

          }

        }
        else if ( geometry.isBufferGeometry )
        {

          var attribute = geometry.attributes.position;

          if ( attribute !== undefined )
          {

            for ( i = 0, l = attribute.count; i < l; i ++ )
            {

              v.fromBufferAttribute( attribute, i ).applyMatrix4(
                node.matrixWorld );

              expandByPoint( v );

            }
          }
        }
      }
    }
  });

  function expandByPoint(point)
  {
    box.min.min( point );
    box.max.max( point );
  }

};

/**
 * Show bounding box for a model. The box is aligned with the world.
 * @param {THREE.Object3D} model
 */
GZ3D.Scene.prototype.showBoundingBox = function(model)
{
  if (typeof model === 'string')
  {
    model = this.scene.getObjectByName(model);
  }

  if (this.boundingBox.visible)
  {
    if (this.boundingBox.parent === model)
    {
      return;
    }
    else
    {
      this.hideBoundingBox();
    }
  }
  var box = new THREE.Box3();
  // w.r.t. world
  this.setFromObject(box, model);
  // center vertices with object
  box.min.x = box.min.x - model.position.x;
  box.min.y = box.min.y - model.position.y;
  box.min.z = box.min.z - model.position.z;
  box.max.x = box.max.x - model.position.x;
  box.max.y = box.max.y - model.position.y;
  box.max.z = box.max.z - model.position.z;

  var position = this.boundingBox.geometry.attributes.position;
  var array = position.array;
  array[  0 ] = box.max.x; array[  1 ] = box.max.y; array[  2 ] = box.max.z;
  array[  3 ] = box.min.x; array[  4 ] = box.max.y; array[  5 ] = box.max.z;
  array[  6 ] = box.min.x; array[  7 ] = box.min.y; array[  8 ] = box.max.z;
  array[  9 ] = box.max.x; array[ 10 ] = box.min.y; array[ 11 ] = box.max.z;
  array[ 12 ] = box.max.x; array[ 13 ] = box.max.y; array[ 14 ] = box.min.z;
  array[ 15 ] = box.min.x; array[ 16 ] = box.max.y; array[ 17 ] = box.min.z;
  array[ 18 ] = box.min.x; array[ 19 ] = box.min.y; array[ 20 ] = box.min.z;
  array[ 21 ] = box.max.x; array[ 22 ] = box.min.y; array[ 23 ] = box.min.z;
  position.needsUpdate = true;
  this.boundingBox.geometry.computeBoundingSphere();

  // rotate the box back to the world
  var modelRotation = new THREE.Matrix4();
  modelRotation.extractRotation(model.matrixWorld);
  var modelInverse = new THREE.Matrix4();
  modelInverse.getInverse(modelRotation);
  this.boundingBox.quaternion.setFromRotationMatrix(modelInverse);
  this.boundingBox.name = 'boundingBox';
  this.boundingBox.visible = true;

  // Add box as model's child
  model.add(this.boundingBox);
};

/**
 * Hide bounding box
 */
GZ3D.Scene.prototype.hideBoundingBox = function()
{
  if(this.boundingBox.parent)
  {
    this.boundingBox.parent.remove(this.boundingBox);
  }
  this.boundingBox.visible = false;
};

/**
 * Mouse right click
 * @param {} event
 * @param {} callback - function to be executed to the clicked model
 */
GZ3D.Scene.prototype.onRightClick = function(event, callback)
{
  var pos = new THREE.Vector2(event.clientX, event.clientY);
  var model = this.getRayCastModel(pos, new THREE.Vector3());

  if(model && model.name !== '' && model.name !== 'plane' &&
      this.modelManipulator.pickerNames.indexOf(model.name) === -1)
  {
    callback(model);
  }
};


/**
 * Set model's view mode
 * @param {} model
 * @param {} viewAs (normal/transparent/wireframe)
 */
GZ3D.Scene.prototype.setViewAs = function(model, viewAs)
{
  // Toggle
  if (model.viewAs === viewAs)
  {
    viewAs = 'normal';
  }

  var showWireframe = (viewAs === 'wireframe');
  function materialViewAs(material)
  {
    if (materials.indexOf(material.id) === -1)
    {
      materials.push(material.id);
      if (viewAs === 'transparent')
      {
        if (material.opacity)
        {
          material.originalOpacity = material.opacity;
        }
        else
        {
          material.originalOpacity = 1.0;
        }
        material.opacity = 0.25;
        material.transparent = true;
      }
      else
      {
        material.opacity = material.originalOpacity ?
            material.originalOpacity : 1.0;
        if (material.opacity >= 1.0)
        {
          material.transparent = false;
        }
      }
      // wireframe handling
      material.wireframe = showWireframe;
    }
  }

  var wireframe;
  var descendants = [];
  var materials = [];
  model.getDescendants(descendants);
  for (var i = 0; i < descendants.length; ++i)
  {
    if (descendants[i].material &&
        descendants[i].name.indexOf('boundingBox') === -1 &&
        descendants[i].name.indexOf('COLLISION_VISUAL') === -1 &&
        !this.getParentByPartialName(descendants[i], 'COLLISION_VISUAL') &&
        descendants[i].name.indexOf('wireframe') === -1 &&
        descendants[i].name.indexOf('JOINT_VISUAL') === -1 &&
        descendants[i].name.indexOf('COM_VISUAL') === -1 &&
        descendants[i].name.indexOf('INERTIA_VISUAL') === -1)
    {
      // Note: multi-material is being deprecated and will be removed soon
      if (descendants[i].material instanceof THREE.MultiMaterial)
      {
        for (var j = 0; j < descendants[i].material.materials.length; ++j)
        {
          materialViewAs(descendants[i].material.materials[j]);
        }
      }
      else if (Array.isArray(descendants[i].material))
      {
        for (var k = 0; k < descendants[i].material.length; ++k)
        {
          materialViewAs(descendants[i].material[k]);
        }
      }
      else
      {
        materialViewAs(descendants[i].material);
      }
    }
  }
  model.viewAs = viewAs;
};

/**
 * Returns the closest parent whose name contains the given string
 * @param {} object
 * @param {} name
 */
GZ3D.Scene.prototype.getParentByPartialName = function(object, name)
{
  var parent = object.parent;
  while (parent && parent !== this.scene)
  {
    if (parent.name.indexOf(name) !== -1)
    {
      return parent;
    }

    parent = parent.parent;
  }
  return null;
};

/**
 * Select entity
 * @param {THREE.Object3D} entity
 */
GZ3D.Scene.prototype.selectEntity = function(object)
{
  // 添加打印实体信息部分
  if (object) {
    // console.log('object', object);
    console.group('%c选中实体详细信息', 'color: #3498db; font-weight: bold; font-size: 14px;');
    
    console.log('%c基本信息:', 'color: #2ecc71; font-weight: bold;');
    console.log('名称:', object.name);
    console.log('类型:', object.type);
    console.log('ID:', object.id);
    console.log('UUID:', object.uuid);
    
    // 位置、旋转和缩放信息
    console.log('%c变换信息:', 'color: #2ecc71; font-weight: bold;');
    console.log('位置 (local):', {x: object.position.x, y: object.position.y, z: object.position.z});
    
    // 获取世界坐标
    var worldPosition = new THREE.Vector3();
    var worldQuaternion = new THREE.Quaternion();
    var worldScale = new THREE.Vector3();
    object.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    
    console.log('位置 (world):', {x: worldPosition.x, y: worldPosition.y, z: worldPosition.z});
    console.log('旋转:', {
      x: object.rotation.x, 
      y: object.rotation.y, 
      z: object.rotation.z, 
      order: object.rotation.order
    });
    console.log('四元数:', {
      x: object.quaternion.x, 
      y: object.quaternion.y, 
      z: object.quaternion.z,
      w: object.quaternion.w
    });
    console.log('缩放:', {x: object.scale.x, y: object.scale.y, z: object.scale.z});
    
    // 如果有 userData 信息
    if (object.userData && Object.keys(object.userData).length > 0) {
      console.log('%cuserData:', 'color: #2ecc71; font-weight: bold;');
      console.log(object.userData);
    }
    
    // 如果有材质信息
    if (object.material) {
      console.log('%c材质信息:', 'color: #2ecc71; font-weight: bold;');
      console.log(object.material);
    }
    
    // 检查是否有几何体
    if (object.geometry) {
      console.log('%c几何体信息:', 'color: #2ecc71; font-weight: bold;');
      console.log(object.geometry);
    }
    
    // 打印子对象
    if (object.children && object.children.length > 0) {
      console.log('%c子对象列表:', 'color: #2ecc71; font-weight: bold;');
      console.log('子对象数量:', object.children.length);
      
      for (var i = 0; i < object.children.length; i++) {
        var child = object.children[i];
        console.log('子对象 #' + i + ':', {
          name: child.name,
          type: child.type,
          id: child.id,
          isLight: child instanceof THREE.Light
        });
      }
    }
    
    // 打印服务器属性（如果有）
    if (object.serverProperties) {
      console.log('%c服务器属性:', 'color: #2ecc71; font-weight: bold;');
      console.log(object.serverProperties);
    }
    
    // 打印其他有用信息
    console.log('%c其他属性:', 'color: #2ecc71; font-weight: bold;');
    console.log('是否可见:', object.visible);
    console.log('渲染顺序:', object.renderOrder);
    console.log('是否可点击:', object.clickable === true);
    console.log('是否投射阴影:', object.castShadow === true);
    console.log('是否接收阴影:', object.receiveShadow === true);
    
    // 完整的实体对象
    console.log('%c完整实体对象:', 'color: #e74c3c; font-weight: bold;');
    console.log(object);
    
    console.groupEnd();
  }
  
  // 保留原有函数逻辑
  if (object)
  {
    if (object !== this.selectedEntity)
    {
      this.showBoundingBox(object);
      this.selectedEntity = object;
    }
    this.attachManipulator(object, this.manipulationMode);
    this.emitter.emit('setTreeSelected', object.name);
  }
  else
  {
    if (this.modelManipulator.object)
    {
      this.modelManipulator.detach();
      this.scene.remove(this.modelManipulator.gizmo);
    }
    this.hideBoundingBox();
    this.selectedEntity = null;
    this.emitter.emit('setTreeDeselected');
  }
};

/**
 * View joints
 * Toggle: if there are joints, hide, otherwise, show.
 * @param {} model
 */
GZ3D.Scene.prototype.viewJoints = function(model)
{
  if (model.joint === undefined || model.joint.length === 0)
  {
    return;
  }

  var child;

  // Visuals already exist
  if (model.jointVisuals)
  {
    // Hide = remove from parent
    if (model.jointVisuals[0].parent !== undefined &&
      model.jointVisuals[0].parent !== null)
    {
      for (var v = 0; v < model.jointVisuals.length; ++v)
      {
        model.jointVisuals[v].parent.remove(model.jointVisuals[v]);
      }
    }
    // Show: attach to parent
    else
    {
      for (var s = 0; s < model.joint.length; ++s)
      {
        child = model.getObjectByName(model.joint[s].child);

        if (!child)
        {
          continue;
        }

        child.add(model.jointVisuals[s]);
      }
    }
  }
  // Create visuals
  else
  {
    model.jointVisuals = [];
    for (var j = 0; j < model.joint.length; ++j)
    {
      child = model.getObjectByName(model.joint[j].child);

      if (!child)
      {
        continue;
      }

      // XYZ expressed w.r.t. child
      var jointVisual = this.jointAxis['XYZaxes'].clone();
      child.add(jointVisual);
      model.jointVisuals.push(jointVisual);
      jointVisual.scale.set(0.7, 0.7, 0.7);

      this.setPose(jointVisual, model.joint[j].pose.position,
          model.joint[j].pose.orientation);

      var mainAxis = null;
      if (model.joint[j].type !== this.jointTypes.BALL &&
          model.joint[j].type !== this.jointTypes.FIXED)
      {
        mainAxis = this.jointAxis['mainAxis'].clone();
        jointVisual.add(mainAxis);
      }

      var secondAxis = null;
      if (model.joint[j].type === this.jointTypes.REVOLUTE2 ||
          model.joint[j].type === this.jointTypes.UNIVERSAL)
      {
        secondAxis = this.jointAxis['mainAxis'].clone();
        jointVisual.add(secondAxis);
      }

      if (model.joint[j].type === this.jointTypes.REVOLUTE ||
          model.joint[j].type === this.jointTypes.GEARBOX)
      {
        mainAxis.add(this.jointAxis['rotAxis'].clone());
      }
      else if (model.joint[j].type === this.jointTypes.REVOLUTE2 ||
               model.joint[j].type === this.jointTypes.UNIVERSAL)
      {
        mainAxis.add(this.jointAxis['rotAxis'].clone());
        secondAxis.add(this.jointAxis['rotAxis'].clone());
      }
      else if (model.joint[j].type === this.jointTypes.BALL)
      {
        jointVisual.add(this.jointAxis['ballVisual'].clone());
      }
      else if (model.joint[j].type === this.jointTypes.PRISMATIC)
      {
        mainAxis.add(this.jointAxis['transAxis'].clone());
      }
      else if (model.joint[j].type === this.jointTypes.SCREW)
      {
        mainAxis.add(this.jointAxis['screwAxis'].clone());
      }

      var direction, tempMatrix, rotMatrix;
      if (mainAxis)
      {
        // main axis expressed w.r.t. parent model or joint frame
        if (!model.joint[j].axis1)
        {
          console.log('no joint axis ' +  model.joint[j].type + 'vs '
            + this.jointTypes.FIXED);
        }
        if (model.joint[j].axis1.use_parent_model_frame === undefined)
        {
          model.joint[j].axis1.use_parent_model_frame = true;
        }

        direction = new THREE.Vector3(
            model.joint[j].axis1.xyz.x,
            model.joint[j].axis1.xyz.y,
            model.joint[j].axis1.xyz.z);
        direction.normalize();

        tempMatrix = new THREE.Matrix4();
        if (model.joint[j].axis1.use_parent_model_frame)
        {
          tempMatrix.extractRotation(jointVisual.matrix);
          tempMatrix.getInverse(tempMatrix);
          direction.applyMatrix4(tempMatrix);
          tempMatrix.extractRotation(child.matrix);
          tempMatrix.getInverse(tempMatrix);
          direction.applyMatrix4(tempMatrix);
        }

        rotMatrix = new THREE.Matrix4();
        rotMatrix.lookAt(direction, new THREE.Vector3(0, 0, 0), mainAxis.up);
        mainAxis.quaternion.setFromRotationMatrix(rotMatrix);
      }

      if (secondAxis)
      {
        if (model.joint[j].axis2.use_parent_model_frame === undefined)
        {
          model.joint[j].axis2.use_parent_model_frame = true;
        }

        direction = new THREE.Vector3(
            model.joint[j].axis2.xyz.x,
            model.joint[j].axis2.xyz.y,
            model.joint[j].axis2.xyz.z);
        direction.normalize();

        tempMatrix = new THREE.Matrix4();
        if (model.joint[j].axis2.use_parent_model_frame)
        {
          tempMatrix.extractRotation(jointVisual.matrix);
          tempMatrix.getInverse(tempMatrix);
          direction.applyMatrix4(tempMatrix);
          tempMatrix.extractRotation(child.matrix);
          tempMatrix.getInverse(tempMatrix);
          direction.applyMatrix4(tempMatrix);
        }

        secondAxis.position =  direction.multiplyScalar(0.3);
        rotMatrix = new THREE.Matrix4();
        rotMatrix.lookAt(direction, new THREE.Vector3(0, 0, 0), secondAxis.up);
        secondAxis.quaternion.setFromRotationMatrix(rotMatrix);
      }
    }
  }
};

/**
 * View Center Of Mass
 * Toggle: if there are COM visuals, hide, otherwise, show.
 * @param {} model
 */
GZ3D.Scene.prototype.viewCOM = function(model)
{
  if (model === undefined || model === null)
  {
    return;
  }
  if (model.children.length === 0)
  {
    return;
  }

  var child;

  // Visuals already exist
  if (model.COMVisuals)
  {
    // Hide = remove from parent
    if (model.COMVisuals[0].parent !== undefined &&
      model.COMVisuals[0].parent !== null)
    {
      for (var v = 0; v < model.COMVisuals.length; ++v)
      {
        for (var k = 0; k < 3; k++)
        {
          model.COMVisuals[v].parent.remove(model.COMVisuals[v].crossLines[k]);
        }
        model.COMVisuals[v].parent.remove(model.COMVisuals[v]);
      }
    }
    // Show: attach to parent
    else
    {
      for (var s = 0; s < model.children.length; ++s)
      {
        child = model.getObjectByName(model.children[s].name);

        if (!child || child.name === 'boundingBox')
        {
          continue;
        }

        child.add(model.COMVisuals[s].crossLines[0]);
        child.add(model.COMVisuals[s].crossLines[1]);
        child.add(model.COMVisuals[s].crossLines[2]);
        child.add(model.COMVisuals[s]);
      }
    }
  }
  // Create visuals
  else
  {
    model.COMVisuals = [];
    var box, COMVisual, line_1, line_2, line_3, helperGeometry_1,
    helperGeometry_2, helperGeometry_3, helperMaterial, points = new Array(6);
    for (var j = 0; j < model.children.length; ++j)
    {
      child = model.getObjectByName(model.children[j].name);

      if (!child)
      {
        continue;
      }

      if (child.userData.inertial)
      {
        var mesh, radius, inertialMass, userdatapose, inertialPose = {};
        var inertial = child.userData.inertial;

        userdatapose = child.userData.inertial.pose;
        inertialMass = inertial.mass;

        // calculate the radius using lead density
        radius = Math.cbrt((0.75 * inertialMass ) / (Math.PI * 11340));

        COMVisual = this.COMvisual.clone();
        child.add(COMVisual);
        model.COMVisuals.push(COMVisual);
        COMVisual.scale.set(radius, radius, radius);

        var position = new THREE.Vector3(0, 0, 0);

        // get euler rotation and convert it to Quaternion
        var quaternion = new THREE.Quaternion();
        var euler = new THREE.Euler(0, 0, 0, 'XYZ');
        quaternion.setFromEuler(euler);

        inertialPose = {
          'position': position,
          'orientation': quaternion
        };

        if (userdatapose !== undefined)
        {
          this.setPose(COMVisual, userdatapose.position,
            userdatapose.orientation);
            inertialPose = userdatapose;
        }

        COMVisual.crossLines = [];

        // Store link's original rotation (w.r.t. the model)
        var originalRotation = new THREE.Euler();
        originalRotation.copy(child.rotation);

        // Align link with world (reverse parent rotation w.r.t. the world)
        child.setRotationFromMatrix(
          new THREE.Matrix4().getInverse(child.parent.matrixWorld));

        // Get its bounding box
        box = new THREE.Box3();

        box.setFromObject(child);

        // Rotate link back to its original rotation
        child.setRotationFromEuler(originalRotation);

        // w.r.t child
        var worldToLocal = new THREE.Matrix4();
        worldToLocal.getInverse(child.matrixWorld);
        box.applyMatrix4(worldToLocal);

        // X
        points[0] = new THREE.Vector3(box.min.x, inertialPose.position.y,
          inertialPose.position.z);
        points[1] = new THREE.Vector3(box.max.x, inertialPose.position.y,
            inertialPose.position.z);
        // Y
        points[2] = new THREE.Vector3(inertialPose.position.x, box.min.y,
              inertialPose.position.z);
        points[3] = new THREE.Vector3(inertialPose.position.x, box.max.y,
                inertialPose.position.z);
        // Z
        points[4] = new THREE.Vector3(inertialPose.position.x,
          inertialPose.position.y, box.min.z);
        points[5] = new THREE.Vector3(inertialPose.position.x,
          inertialPose.position.y, box.max.z);

        helperGeometry_1 = new THREE.Geometry();
        helperGeometry_1.vertices.push(points[0]);
        helperGeometry_1.vertices.push(points[1]);

        helperGeometry_2 = new THREE.Geometry();
        helperGeometry_2.vertices.push(points[2]);
        helperGeometry_2.vertices.push(points[3]);

        helperGeometry_3 = new THREE.Geometry();
        helperGeometry_3.vertices.push(points[4]);
        helperGeometry_3.vertices.push(points[5]);

        helperMaterial = new THREE.LineBasicMaterial({color: 0x00ff00});

        line_1 = new THREE.Line(helperGeometry_1, helperMaterial,
            THREE.LineSegments);
        line_2 = new THREE.Line(helperGeometry_2, helperMaterial,
            THREE.LineSegments);
        line_3 = new THREE.Line(helperGeometry_3, helperMaterial,
            THREE.LineSegments);

        line_1.name = 'COM_VISUAL';
        line_2.name = 'COM_VISUAL';
        line_3.name = 'COM_VISUAL';
        COMVisual.crossLines.push(line_1);
        COMVisual.crossLines.push(line_2);
        COMVisual.crossLines.push(line_3);

        // show lines
        child.add(line_1);
        child.add(line_2);
        child.add(line_3);
       }
    }
  }
};

// TODO: Issue https://github.com/osrf/gzweb/issues/138
/**
 * View inertia
 * Toggle: if there are inertia visuals, hide, otherwise, show.
 * @param {} model
 */
GZ3D.Scene.prototype.viewInertia = function(model)
{
  if (model === undefined || model === null)
  {
    return;
  }

  if (model.children.length === 0)
  {
    return;
  }

  var child;

  // Visuals already exist
  if (model.inertiaVisuals)
  {
    // Hide = remove from parent
    if (model.inertiaVisuals[0].parent !== undefined &&
      model.inertiaVisuals[0].parent !== null)
    {
      for (var v = 0; v < model.inertiaVisuals.length; ++v)
      {
        for (var k = 0; k < 3; k++)
        {
          model.inertiaVisuals[v].parent.remove(
            model.inertiaVisuals[v].crossLines[k]);
        }
        model.inertiaVisuals[v].parent.remove(model.inertiaVisuals[v]);
      }
    }
    // Show: attach to parent
    else
    {
      for (var s = 0; s < model.children.length; ++s)
      {
        child = model.getObjectByName(model.children[s].name);

        if (!child || child.name === 'boundingBox')
        {
          continue;
        }
        child.add(model.inertiaVisuals[s].crossLines[0]);
        child.add(model.inertiaVisuals[s].crossLines[1]);
        child.add(model.inertiaVisuals[s].crossLines[2]);
        child.add(model.inertiaVisuals[s]);
      }
    }
  }
  // Create visuals
  else
  {
    model.inertiaVisuals = [];
    var box , line_1, line_2, line_3, helperGeometry_1, helperGeometry_2,
    helperGeometry_3, helperMaterial, inertial, inertiabox,
    points = new Array(6);
    for (var j = 0; j < model.children.length; ++j)
    {
      child = model.getObjectByName(model.children[j].name);

      if (!child)
      {
        continue;
      }

      inertial = child.userData.inertial;
      if (inertial)
      {
        var mesh, boxScale, Ixx, Iyy, Izz, mass, inertia, material,
          inertialPose = {};

        if (inertial.pose)
        {
          inertialPose = child.userData.inertial.pose;
        }
        else if (child.position)
        {
          inertialPose.position = child.position;
          inertialPose.orientation = child.quaternion;
        }
        else
        {
          console.log('Link pose not found!');
          continue;
        }

        mass = inertial.mass;
        inertia = inertial.inertia;
        Ixx = inertia.ixx;
        Iyy = inertia.iyy;
        Izz = inertia.izz;
        boxScale = new THREE.Vector3();

        if (mass < 0 || Ixx < 0 || Iyy < 0 || Izz < 0 ||
          Ixx + Iyy < Izz || Iyy + Izz < Ixx || Izz + Ixx < Iyy)
        {
          // Unrealistic inertia, load with default scale
          console.log('The link ' + child.name + ' has unrealistic inertia, '
                +'unable to visualize box of equivalent inertia.');
        }
        else
        {
          // Compute dimensions of box with uniform density
          // and equivalent inertia.
          boxScale.x = Math.sqrt(6*(Izz +  Iyy - Ixx) / mass);
          boxScale.y = Math.sqrt(6*(Izz +  Ixx - Iyy) / mass);
          boxScale.z = Math.sqrt(6*(Ixx  + Iyy - Izz) / mass);

          inertiabox = new THREE.Object3D();
          inertiabox.name = 'INERTIA_VISUAL';

          // Inertia indicator: equivalent box of uniform density
          mesh = this.createBox(1, 1, 1);
          mesh.name = 'INERTIA_VISUAL';
          material = {'ambient':[1,0.0,1,1],'diffuse':[1,0.0,1,1],
            'depth_write':false,'opacity':0.5};
          this.setMaterial(mesh, material);
          inertiabox.add(mesh);
          inertiabox.name = 'INERTIA_VISUAL';
          child.add(inertiabox);

          model.inertiaVisuals.push(inertiabox);
          inertiabox.scale.set(boxScale.x, boxScale.y, boxScale.z);
          inertiabox.crossLines = [];

          this.setPose(inertiabox, inertialPose.position,
            inertialPose.orientation);
          // show lines
          box = new THREE.Box3();
          // w.r.t. world
          box.setFromObject(child);
          points[0] = new THREE.Vector3(inertialPose.position.x,
            inertialPose.position.y,
            -2 * boxScale.z + inertialPose.position.z);
          points[1] = new THREE.Vector3(inertialPose.position.x,
            inertialPose.position.y, 2 * boxScale.z + inertialPose.position.z);
          points[2] = new THREE.Vector3(inertialPose.position.x,
            -2 * boxScale.y + inertialPose.position.y ,
            inertialPose.position.z);
          points[3] = new THREE.Vector3(inertialPose.position.x,
            2 * boxScale.y + inertialPose.position.y, inertialPose.position.z);
          points[4] = new THREE.Vector3(
            -2 * boxScale.x + inertialPose.position.x,
            inertialPose.position.y, inertialPose.position.z);
          points[5] = new THREE.Vector3(
            2 * boxScale.x + inertialPose.position.x,
            inertialPose.position.y, inertialPose.position.z);

          helperGeometry_1 = new THREE.Geometry();
          helperGeometry_1.vertices.push(points[0]);
          helperGeometry_1.vertices.push(points[1]);

          helperGeometry_2 = new THREE.Geometry();
          helperGeometry_2.vertices.push(points[2]);
          helperGeometry_2.vertices.push(points[3]);

          helperGeometry_3 = new THREE.Geometry();
          helperGeometry_3.vertices.push(points[4]);
          helperGeometry_3.vertices.push(points[5]);

          helperMaterial = new THREE.LineBasicMaterial({color: 0x00ff00});
          line_1 = new THREE.Line(helperGeometry_1, helperMaterial,
              THREE.LineSegments);
          line_2 = new THREE.Line(helperGeometry_2, helperMaterial,
            THREE.LineSegments);
          line_3 = new THREE.Line(helperGeometry_3, helperMaterial,
            THREE.LineSegments);

          line_1.name = 'INERTIA_VISUAL';
          line_2.name = 'INERTIA_VISUAL';
          line_3.name = 'INERTIA_VISUAL';
          inertiabox.crossLines.push(line_1);
          inertiabox.crossLines.push(line_2);
          inertiabox.crossLines.push(line_3);

          // attach lines
          child.add(line_1);
          child.add(line_2);
          child.add(line_3);
        }
      }
    }
  }
};

/**
 * Update a light entity from a message
 * @param {} entity
 * @param {} msg
 */
GZ3D.Scene.prototype.updateLight = function(entity, msg)
{
  // TODO: Generalize this and createLight
  var lightObj = entity.children[0];
  var dir;

  var color = new THREE.Color();

  if (msg.diffuse)
  {
    color.r = msg.diffuse.r;
    color.g = msg.diffuse.g;
    color.b = msg.diffuse.b;
    lightObj.color = color.clone();
  }
  if (msg.specular)
  {
    color.r = msg.specular.r;
    color.g = msg.specular.g;
    color.b = msg.specular.b;
    entity.serverProperties.specular = color.clone();
  }

  var matrixWorld;
  if (msg.pose)
  {
    // needed to update light's direction
    this.setPose(entity, msg.pose.position, msg.pose.orientation);
    entity.matrixWorldNeedsUpdate = true;
  }

  if (msg.range)
  {
    // THREE.js's light distance impacts the attenuation factor defined in the
    // shader:
    // attenuation factor = 1.0 - distance-to-enlighted-point / light.distance
    // Gazebo's range (taken from OGRE 3D API) does not contribute to
    // attenuation; it is a hard limit for light scope.
    // Nevertheless, we identify them for sake of simplicity.
    lightObj.distance = msg.range;
  }

  if (msg.cast_shadows)
  {
    lightObj.castShadow = msg.cast_shadows;
  }

  if (msg.attenuation_constant)
  {
    entity.serverProperties.attenuation_constant = msg.attenuation_constant;
  }
  if (msg.attenuation_linear)
  {
    entity.serverProperties.attenuation_linear = msg.attenuation_linear;
    lightObj.intensity = lightObj.intensity/(1+msg.attenuation_linear);
  }
  if (msg.attenuation_quadratic)
  {
    entity.serverProperties.attenuation_quadratic = msg.attenuation_quadratic;
    lightObj.intensity = lightObj.intensity/(1+msg.attenuation_quadratic);
  }

//  Not handling these on gzweb for now
//
//  if (lightObj instanceof THREE.SpotLight) {
//    if (msg.spot_outer_angle) {
//      lightObj.angle = msg.spot_outer_angle;
//    }
//    if (msg.spot_falloff) {
//      lightObj.exponent = msg.spot_falloff;
//    }
//  }

  if (msg.direction)
  {
    dir = new THREE.Vector3(msg.direction.x, msg.direction.y,
        msg.direction.z);

    entity.direction = new THREE.Vector3();
    entity.direction.copy(dir);

    if (lightObj.target)
    {
      lightObj.target.position.copy(dir);
    }
  }
};

/**
 * Adds an sdf model to the scene.
 * @param {object} sdf - It is either SDF XML string or SDF XML DOM object
 * @returns {THREE.Object3D}
 */
GZ3D.Scene.prototype.createFromSdf = function(sdf)
{
  if (sdf === undefined)
  {
    console.log(' No argument provided ');
    return;
  }

  var obj = new THREE.Object3D();

  var sdfXml = this.spawnModel.sdfParser.parseXML(sdf);
  // sdfXML is always undefined, the XML parser doesn't work while testing
  // while it does work during normal usage.
  var myjson = xml2json(sdfXml, '\t');
  var sdfObj = JSON.parse(myjson).sdf;

  var mesh = this.spawnModel.sdfParser.spawnFromSDF(sdf);
  if (!mesh)
  {
    return;
  }

  obj.name = mesh.name;
  obj.add(mesh);

  return obj;
};

// gz3d/src/gzscene.js 末尾添加

GZ3D.Scene.prototype.exportSDF = function() {
  let sdf = [];
  sdf.push('<?xml version="1.0" ?>');
  sdf.push('<sdf version="1.6">');
  sdf.push('  <world name="default">');

  // 遍历three.js场景中的所有对象
  (this.scene.children || []).forEach(function(obj) {
    // 导出模型
    if (obj.type === 'Object3D' && obj.children.length > 0 && !(obj.children[0] instanceof THREE.Light)) {
      sdf.push(exportModelSDF(obj, 4));
    }
    // 导出灯光
    if (obj.children.length > 0 && obj.children[0] instanceof THREE.Light) {
      sdf.push(exportLightSDF(obj, 4));
    }
  });

  sdf.push('  </world>');
  sdf.push('</sdf>');
  return sdf.join('\n');
};

/**
 * 导出模型的 SDF
 * @param {THREE.Object3D} obj - 模型对象
 * @param {number} indent - 缩进级别
 * @returns {string} - SDF 字符串
 */
function exportModelSDF(obj, indent = 0) {
  // 获取模型类型，未设置则尝试判断
  var modelType = obj.userData && obj.userData.modelType;
  if (!modelType) {
    if (isMeshModel(obj)) {
      modelType = 'mesh';
    } else if (isCompositeModel(obj)) {
      modelType = 'complex';
    } else {
      modelType = 'easy';
    }
  }
  
  // 根据模型类型选择不同的导出策略
  if (modelType === 'mesh') {
    // 对mesh类型模型使用特殊处理
    return exportMeshModelSDF(obj, indent);
  } else if (modelType === 'complex') {
    // 对复合模型使用复合导出
    return exportComplexModelSDF(obj, indent);
  } else {
    // 对简单模型使用基本导出
    return exportSimpleModelSDF(obj, indent);
  }
}

/**
 * 导出网格模型的SDF
 * @param {THREE.Object3D} obj - 模型对象
 * @param {number} indent - 缩进级别
 * @returns {string} - SDF 字符串
 */
function exportMeshModelSDF(obj, indent = 0) {
  var modelName = obj.name || 'model';
  var baseModelName = obj.userData.baseModelName || getBaseModelName(modelName);
  
  var indentStr = ' '.repeat(indent);
  var childIndentStr = ' '.repeat(indent + 2);
  var grandChildIndentStr = ' '.repeat(indent + 4);
  var greatGrandChildIndentStr = ' '.repeat(indent + 6);
  
  // 从userData获取模型配置
  var modelXOffset = obj.userData.modelXOffset || 0;
  var modelYOffset = obj.userData.modelYOffset || 0;
  var modelZOffset = obj.userData.modelZOffset || 0;
  var defaultScale = obj.userData.defaultScale || {x: 1, y: 1, z: 1};
  
  var position = obj.position;
  var quaternion = obj.quaternion;
  
  // 获取欧拉角，用于pose
  var euler = new THREE.Euler().setFromQuaternion(quaternion);
  
  var sdf = `${indentStr}<model name='${modelName}'>\n`;
  sdf += `${childIndentStr}<static>1</static>\n`;
  
  // 添加link
  sdf += `${childIndentStr}<link name='link'>\n`;
  
  // 注意：在fast_food的格式中，pose在link级别
  sdf += `${grandChildIndentStr}<pose>${modelXOffset} ${modelYOffset} ${modelZOffset} 0 -0 0</pose>\n`;
  
  // 添加collision
  sdf += `${grandChildIndentStr}<collision name='collision'>\n`;
  sdf += `${greatGrandChildIndentStr}<geometry>\n`;
  sdf += `${greatGrandChildIndentStr}  <mesh>\n`;
  sdf += `${greatGrandChildIndentStr}    <scale>${defaultScale.x} ${defaultScale.y} ${defaultScale.z}</scale>\n`;
  sdf += `${greatGrandChildIndentStr}    <uri>model://${baseModelName}/meshes/${baseModelName}.dae</uri>\n`;
  sdf += `${greatGrandChildIndentStr}  </mesh>\n`;
  sdf += `${greatGrandChildIndentStr}</geometry>\n`;
  
  // 添加碰撞属性
  sdf += `${greatGrandChildIndentStr}<max_contacts>10</max_contacts>\n`;
  sdf += `${greatGrandChildIndentStr}<surface>\n`;
  sdf += `${greatGrandChildIndentStr}  <contact>\n`;
  sdf += `${greatGrandChildIndentStr}    <ode/>\n`;
  sdf += `${greatGrandChildIndentStr}  </contact>\n`;
  sdf += `${greatGrandChildIndentStr}  <bounce/>\n`;
  sdf += `${greatGrandChildIndentStr}  <friction>\n`;
  sdf += `${greatGrandChildIndentStr}    <torsional>\n`;
  sdf += `${greatGrandChildIndentStr}      <ode/>\n`;
  sdf += `${greatGrandChildIndentStr}    </torsional>\n`;
  sdf += `${greatGrandChildIndentStr}    <ode/>\n`;
  sdf += `${greatGrandChildIndentStr}  </friction>\n`;
  sdf += `${greatGrandChildIndentStr}</surface>\n`;
  sdf += `${grandChildIndentStr}</collision>\n`;
  
  // 添加visual
  sdf += `${grandChildIndentStr}<visual name='visual'>\n`;
  sdf += `${greatGrandChildIndentStr}<geometry>\n`;
  sdf += `${greatGrandChildIndentStr}  <mesh>\n`;
  sdf += `${greatGrandChildIndentStr}    <scale>${defaultScale.x} ${defaultScale.y} ${defaultScale.z}</scale>\n`;
  sdf += `${greatGrandChildIndentStr}    <uri>model://${baseModelName}/meshes/${baseModelName}.dae</uri>\n`;
  sdf += `${greatGrandChildIndentStr}  </mesh>\n`;
  sdf += `${greatGrandChildIndentStr}</geometry>\n`;
  
  // 添加材质
  sdf += `${greatGrandChildIndentStr}<material>\n`;
  sdf += `${greatGrandChildIndentStr}  <script>\n`;
  sdf += `${greatGrandChildIndentStr}    <uri>model://${baseModelName}/materials/scripts</uri>\n`;
  sdf += `${greatGrandChildIndentStr}    <uri>model://${baseModelName}/materials/textures</uri>\n`;
  sdf += `${greatGrandChildIndentStr}    <name>${formatModelName(baseModelName)}/Diffuse</name>\n`;
  sdf += `${greatGrandChildIndentStr}  </script>\n`;
  sdf += `${greatGrandChildIndentStr}  <shader type='normal_map_tangent_space'>\n`;
  sdf += `${greatGrandChildIndentStr}    <normal_map>${formatModelName(baseModelName)}_Normal.png</normal_map>\n`;
  sdf += `${greatGrandChildIndentStr}  </shader>\n`;
  sdf += `${greatGrandChildIndentStr}</material>\n`;
  sdf += `${grandChildIndentStr}</visual>\n`;
  
  // 添加其他属性
  sdf += `${grandChildIndentStr}<self_collide>0</self_collide>\n`;
  sdf += `${grandChildIndentStr}<enable_wind>0</enable_wind>\n`;
  sdf += `${grandChildIndentStr}<kinematic>0</kinematic>\n`;
  sdf += `${childIndentStr}</link>\n`;
  
  // 模型级别的pose（位于链接之后）
  sdf += `${childIndentStr}<pose>${position.x} ${position.y} ${position.z} ${euler.x} ${euler.y} ${euler.z}</pose>\n`;
  sdf += `${indentStr}</model>`;
  
  return sdf;
}

/**
 * 导出简单模型的SDF
 * @param {THREE.Object3D} obj - 模型对象
 * @param {number} indent - 缩进级别
 * @returns {string} - SDF 字符串
 */
function exportSimpleModelSDF(obj, indent = 0) {
  var modelName = obj.name || 'model';
  var baseModelName = obj.userData.baseModelName || getBaseModelName(modelName);
  
  var indentStr = ' '.repeat(indent);
  var childIndentStr = ' '.repeat(indent + 2);
  var grandChildIndentStr = ' '.repeat(indent + 4);
  
  // 获取世界位置和方向
  var position = obj.position;
  var quaternion = obj.quaternion;
  var euler = new THREE.Euler().setFromQuaternion(quaternion);
  
  // 开始构建SDF
  var sdf = `${indentStr}<model name="${modelName}">\n`;
  
  // 添加位置信息
  sdf += `${indentStr}<pose>${position.x} ${position.y} ${position.z} ${euler.x} ${euler.y} ${euler.z}</pose>\n`;
  
  // 根据官方格式添加链接
  sdf += `${indentStr}<link name='link'>\n`;
  
  // 添加惯性属性
  sdf += `${childIndentStr}<inertial>\n`;
  sdf += `${grandChildIndentStr}<mass>1</mass>\n`;
  sdf += `${grandChildIndentStr}<inertia>\n`;
  sdf += `${grandChildIndentStr}  <ixx>0.145833</ixx>\n`;
  sdf += `${grandChildIndentStr}  <ixy>0</ixy>\n`;
  sdf += `${grandChildIndentStr}  <ixz>0</ixz>\n`;
  sdf += `${grandChildIndentStr}  <iyy>0.145833</iyy>\n`;
  sdf += `${grandChildIndentStr}  <iyz>0</iyz>\n`;
  sdf += `${grandChildIndentStr}  <izz>0.125</izz>\n`;
  sdf += `${grandChildIndentStr}</inertia>\n`;
  sdf += `${grandChildIndentStr}<pose>0 0 0 0 -0 0</pose>\n`;
  sdf += `${childIndentStr}</inertial>\n`;
  
  // 添加碰撞信息
  sdf += `${childIndentStr}<collision name='collision'>\n`;
  sdf += `${grandChildIndentStr}<geometry>\n`;
  sdf += exportGeometrySDF(obj, indent + 6);
  sdf += `${grandChildIndentStr}</geometry>\n`;
  sdf += `${grandChildIndentStr}<max_contacts>10</max_contacts>\n`;
  sdf += `${grandChildIndentStr}<surface>\n`;
  sdf += `${grandChildIndentStr}  <contact>\n`;
  sdf += `${grandChildIndentStr}    <ode/>\n`;
  sdf += `${grandChildIndentStr}  </contact>\n`;
  sdf += `${grandChildIndentStr}  <bounce/>\n`;
  sdf += `${grandChildIndentStr}  <friction>\n`;
  sdf += `${grandChildIndentStr}    <torsional>\n`;
  sdf += `${grandChildIndentStr}      <ode/>\n`;
  sdf += `${grandChildIndentStr}    </torsional>\n`;
  sdf += `${grandChildIndentStr}    <ode/>\n`;
  sdf += `${grandChildIndentStr}  </friction>\n`;
  sdf += `${grandChildIndentStr}</surface>\n`;
  sdf += `${childIndentStr}</collision>\n`;
  
  // 添加视觉信息
  sdf += `${childIndentStr}<visual name='visual'>\n`;
  sdf += `${grandChildIndentStr}<geometry>\n`;
  sdf += exportGeometrySDF(obj, indent + 6);
  sdf += `${grandChildIndentStr}</geometry>\n`;
  sdf += `${grandChildIndentStr}<material>\n`;
  sdf += `${grandChildIndentStr}  <script>\n`;
  sdf += `${grandChildIndentStr}    <name>Gazebo/Grey</name>\n`;
  sdf += `${grandChildIndentStr}    <uri>file://media/materials/scripts/gazebo.material</uri>\n`;
  sdf += `${grandChildIndentStr}  </script>\n`;
  sdf += `${grandChildIndentStr}</material>\n`;
  sdf += `${childIndentStr}</visual>\n`;
  
  // 添加其他属性
  sdf += `${childIndentStr}<self_collide>0</self_collide>\n`;
  sdf += `${childIndentStr}<enable_wind>0</enable_wind>\n`;
  sdf += `${childIndentStr}<kinematic>0</kinematic>\n`;
  
  // 关闭链接和模型标签
  sdf += `${indentStr}</link>\n`;
  sdf += `${indentStr}</model>`;
  
  return sdf;
}

/**
 * 获取模型缩放
 * @param {string} modelName - 模型名称
 * @returns {object} - 包含x,y,z缩放的对象
 */
function getModelScale(modelName) {
  // 模型缩放表
  var modelScales = {
    'fast_food': { x: 3, y: 3, z: 2 },
    'house_1': { x: 1.5, y: 1.5, z: 1.5 },
    'ambulance': { x: 1, y: 1, z: 1 },
    'person_standing': { x: 1, y: 1, z: 1 },
    'person_walking': { x: 1, y: 1, z: 1 }
    // 可以根据需要添加更多模型
  };
  
  // 检查是否有预定义缩放
  for (var key in modelScales) {
    if (modelName === key || modelName.indexOf(key) === 0) {
      return modelScales[key];
    }
  }
  
  // 默认返回 1,1,1
  return { x: 1, y: 1, z: 1 };
}

/**
 * 检查是否为网格模型
 * @param {THREE.Object3D} obj - 模型对象
 * @returns {boolean} - 是否为网格模型
 */
function isMeshModel(obj) {
  const name = obj.name || '';
  const baseName = name.split('_')[0].toLowerCase();
  
  // 排除简单几何体
  if (baseName === 'box' || baseName === 'sphere' || baseName === 'cylinder' ||
      baseName === 'pointlight' || baseName === 'spotlight' || baseName === 'directionallight') {
    return false;
  }
  
  // 检查userData
  if (obj.userData && obj.userData.modelType === 'mesh') {
    return true;
  }
  
  // 特定模型明确标记为网格模型
  const meshModels = [
    'fast_food', 'gas_station', 'bookshelf', 'cafe', 'house',
    'ambulance', 'table', 'table_marble', 'person_standing', 'person_walking'
  ];
  
  for (const model of meshModels) {
    if (baseName.indexOf(model) >= 0) {
      return true;
    }
  }
  
  // 其他情况默认为非网格模型
  return false;
}

/**
 * 获取有效的模型名称
 * @param {string} modelName - 原始模型名
 * @returns {string} - 有效的模型名
 */
function getValidModelName(modelName) {
  // 特殊映射
  var specialMappings = {
    'fast_food': 'fast_food', 
    'house1': 'house_1',
    'house2': 'house_2',
    'house3': 'house_3'
  };
  
  if (specialMappings[modelName]) {
    return specialMappings[modelName];
  }
  
  return modelName;
}

// 导出默认碰撞元素SDF
function exportDefaultCollisionSDF(obj, indent = 0) {
  let sdf = '';
  const indentStr = ' '.repeat(indent);
  
  sdf += `${indentStr}<collision name='collision'>\n`;
  sdf += `${indentStr}  <geometry>\n`;
  sdf += exportGeometrySDF(obj, indent + 4);
  sdf += `${indentStr}  </geometry>\n`;
  
  // 添加碰撞属性
  sdf += `${indentStr}  <max_contacts>10</max_contacts>\n`;
  sdf += `${indentStr}  <surface>\n`;
  sdf += `${indentStr}    <contact>\n`;
  sdf += `${indentStr}      <ode/>\n`;
  sdf += `${indentStr}    </contact>\n`;
  sdf += `${indentStr}    <bounce/>\n`;
  sdf += `${indentStr}    <friction>\n`;
  sdf += `${indentStr}      <torsional>\n`;
  sdf += `${indentStr}        <ode/>\n`;
  sdf += `${indentStr}      </torsional>\n`;
  sdf += `${indentStr}      <ode/>\n`;
  sdf += `${indentStr}    </friction>\n`;
  sdf += `${indentStr}  </surface>\n`;
  
  sdf += `${indentStr}</collision>\n`;
  
  return sdf;
}

// 导出碰撞元素SDF
function exportCollisionSDF(collisionObj, indent = 0) {
  let sdf = '';
  const indentStr = ' '.repeat(indent);
  
  sdf += `${indentStr}<collision name='${collisionObj.name}'>\n`;
  
  // 添加位姿（如果有）
  if (collisionObj.position || collisionObj.quaternion) {
    const pos = collisionObj.position || new THREE.Vector3();
    const quat = collisionObj.quaternion || new THREE.Quaternion();
    const euler = new THREE.Euler().setFromQuaternion(quat);
    sdf += `${indentStr}  <pose>${pos.x} ${pos.y} ${pos.z} ${euler.x} ${euler.y} ${euler.z}</pose>\n`;
  }
  
  // 添加几何体
  sdf += `${indentStr}  <geometry>\n`;
  sdf += exportGeometrySDF(collisionObj, indent + 4);
  sdf += `${indentStr}  </geometry>\n`;
  
  // 添加碰撞属性
  sdf += `${indentStr}  <max_contacts>10</max_contacts>\n`;
  sdf += `${indentStr}  <surface>\n`;
  sdf += `${indentStr}    <contact>\n`;
  sdf += `${indentStr}      <ode/>\n`;
  sdf += `${indentStr}    </contact>\n`;
  sdf += `${indentStr}    <bounce/>\n`;
  sdf += `${indentStr}    <friction>\n`;
  sdf += `${indentStr}      <torsional>\n`;
  sdf += `${indentStr}        <ode/>\n`;
  sdf += `${indentStr}      </torsional>\n`;
  sdf += `${indentStr}      <ode/>\n`;
  sdf += `${indentStr}    </friction>\n`;
  sdf += `${indentStr}  </surface>\n`;
  
  sdf += `${indentStr}</collision>\n`;
  
  return sdf;
}

// 导出默认视觉元素SDF
function exportDefaultVisualSDF(obj, indent = 0) {
  let sdf = '';
  const indentStr = ' '.repeat(indent);
  
  sdf += `${indentStr}<visual name='visual'>\n`;
  sdf += `${indentStr}  <geometry>\n`;
  sdf += exportGeometrySDF(obj, indent + 4);
  sdf += `${indentStr}  </geometry>\n`;
  
  // 添加标准材质
  sdf += `${indentStr}  <material>\n`;
  sdf += `${indentStr}    <script>\n`;
  sdf += `${indentStr}      <name>Gazebo/Grey</name>\n`;
  sdf += `${indentStr}      <uri>file://media/materials/scripts/gazebo.material</uri>\n`;
  sdf += `${indentStr}    </script>\n`;
  sdf += `${indentStr}  </material>\n`;
  
  sdf += `${indentStr}</visual>\n`;
  
  return sdf;
}

// 导出几何体SDF
function exportGeometrySDF(obj, indent = 0) {
  const indentStr = ' '.repeat(indent);
  let sdf = '';
  
  if (isSimpleShape(obj, 'box')) {
    sdf += `${indentStr}<box>\n`;
    sdf += `${indentStr}  <size>1 1 1</size>\n`;
    sdf += `${indentStr}</box>\n`;
  } else if (isSimpleShape(obj, 'sphere')) {
    sdf += `${indentStr}<sphere>\n`;
    sdf += `${indentStr}  <radius>0.5</radius>\n`;
    sdf += `${indentStr}</sphere>\n`;
  } else if (isSimpleShape(obj, 'cylinder')) {
    sdf += `${indentStr}<cylinder>\n`;
    sdf += `${indentStr}  <radius>0.5</radius>\n`;
    sdf += `${indentStr}  <length>1</length>\n`;
    sdf += `${indentStr}</cylinder>\n`;
  } else if (isMeshModel(obj)) {
    // 获取有效的模型名称，确保URI正确
    const modelName = getValidModelName(obj.name);
    
    sdf += `${indentStr}<mesh>\n`;
    sdf += `${indentStr}  <uri>model://${modelName}/meshes/${modelName}.dae</uri>\n`;
    
    // 获取模型缩放
    let scale = getModelScale(modelName);
    
    // 如果userData中有原始缩放信息，优先使用
    if (obj.userData && obj.userData.originalScale) {
      scale = obj.userData.originalScale;
      console.log(`使用保存的缩放信息: ${scale.x},${scale.y},${scale.z}`);
    }
    
    sdf += `${indentStr}  <scale>${scale.x} ${scale.y} ${scale.z}</scale>\n`;
    sdf += `${indentStr}</mesh>\n`;
  } else {
    // 默认为盒子模型
    console.log("can't find the model type ,use box model");
    sdf += `${indentStr}<box>\n`;
    sdf += `${indentStr}  <size>1 1 1</size>\n`;
    sdf += `${indentStr}</box>\n`;
  }
  
  return sdf;
}

// 修改格式化模型名称的函数
function formatModelName(modelName) {
  // 按照下划线分割字符串
  const parts = modelName.split('_');
  
  // 处理每个部分
  const formattedParts = parts.map(part => {
    // 如果部分是纯数字，保持原样
    if (/^\d+$/.test(part)) {
      return part;
    }
    // 否则将首字母大写
    return part.charAt(0).toUpperCase() + part.slice(1);
  });
  
  // 重新组合，如果相邻部分都是数字，用下划线连接
  let result = '';
  for (let i = 0; i < formattedParts.length; i++) {
    if (i > 0) {
      // 如果当前部分或前一部分是数字，用下划线连接
      if (/^\d+$/.test(formattedParts[i]) || /^\d+$/.test(formattedParts[i-1])) {
        result += '_';
      }
    }
    result += formattedParts[i];
  }
  
  return result;
}

// 导出灯光SDF
function exportLightSDF(obj, indent = 0) {
  let sdf = '';
  const indentStr = ' '.repeat(indent);
  
  // 获取灯光类型
  let type = 'point';
  const light = obj.children && obj.children[0];
  
  if (light instanceof THREE.SpotLight) {
    type = 'spot';
  } else if (light instanceof THREE.DirectionalLight) {
    type = 'directional';
  }
  
  // 开始灯光标签
  sdf += `${indentStr}<light name='${obj.name}' type='${type}'>\n`;
  
  // 添加是否投射阴影
  sdf += `${indentStr}  <cast_shadows>1</cast_shadows>\n`;
  
  // 添加位姿信息
  const pos = obj.position || new THREE.Vector3();
  const quat = obj.quaternion || new THREE.Quaternion();
  const euler = new THREE.Euler().setFromQuaternion(quat);
  sdf += `${indentStr}  <pose>${pos.x} ${pos.y} ${pos.z} ${euler.x} ${euler.y} ${euler.z}</pose>\n`;
  
  // 添加颜色信息
  if (light && light.color) {
    const color = light.color;
    sdf += `${indentStr}  <diffuse>${color.r} ${color.g} ${color.b} 1</diffuse>\n`;
    sdf += `${indentStr}  <specular>0.2 0.2 0.2 1</specular>\n`;
  } else {
    // 默认颜色
    sdf += `${indentStr}  <diffuse>0.8 0.8 0.8 1</diffuse>\n`;
    sdf += `${indentStr}  <specular>0.2 0.2 0.2 1</specular>\n`;
  }
  
  // 添加衰减信息
  sdf += `${indentStr}  <attenuation>\n`;
  
  if (light && light.distance) {
    sdf += `${indentStr}    <range>${light.distance}</range>\n`;
  } else {
    sdf += `${indentStr}    <range>1000</range>\n`;
  }
  
  // 添加衰减系数
  if (obj.serverProperties) {
    const props = obj.serverProperties;
    const constant = props.attenuation_constant !== undefined ? props.attenuation_constant : 0.9;
    const linear = props.attenuation_linear !== undefined ? props.attenuation_linear : 0.01;
    const quadratic = props.attenuation_quadratic !== undefined ? props.attenuation_quadratic : 0.001;
    
    sdf += `${indentStr}    <constant>${constant}</constant>\n`;
    sdf += `${indentStr}    <linear>${linear}</linear>\n`;
    sdf += `${indentStr}    <quadratic>${quadratic}</quadratic>\n`;
  } else {
    // 默认衰减系数
    sdf += `${indentStr}    <constant>0.9</constant>\n`;
    sdf += `${indentStr}    <linear>0.01</linear>\n`;
    sdf += `${indentStr}    <quadratic>0.001</quadratic>\n`;
  }
  
  sdf += `${indentStr}  </attenuation>\n`;
  
  // 添加方向信息
  if (obj.direction) {
    sdf += `${indentStr}  <direction>${obj.direction.x} ${obj.direction.y} ${obj.direction.z}</direction>\n`;
  } else {
    // 默认方向
    sdf += `${indentStr}  <direction>-0.5 0.1 -0.9</direction>\n`;
  }
  
  // 聚光灯特有属性
  if (type === 'spot') {
    sdf += `${indentStr}  <spot>\n`;
    
    if (light && light.angle) {
      // Three.js的angle是半角，而Gazebo需要全角
      const outerAngle = light.angle * 2;
      // 内角通常是外角的90%
      const innerAngle = outerAngle * 0.9;
      
      sdf += `${indentStr}    <inner_angle>${innerAngle}</inner_angle>\n`;
      sdf += `${indentStr}    <outer_angle>${outerAngle}</outer_angle>\n`;
    } else {
      // 默认角度
      sdf += `${indentStr}    <inner_angle>0</inner_angle>\n`;
      sdf += `${indentStr}    <outer_angle>0</outer_angle>\n`;
    }
    
    if (light && light.penumbra) {
      sdf += `${indentStr}    <falloff>${light.penumbra}</falloff>\n`;
    } else {
      // 默认衰减
      sdf += `${indentStr}    <falloff>0</falloff>\n`;
    }
    
    sdf += `${indentStr}  </spot>\n`;
  }
  
  // 结束灯光标签
  sdf += `${indentStr}</light>\n`;
  
  return sdf;
}

// 工具函数：判断是否visual/collision
function isVisual(obj) {
  return obj.name && obj.name.toLowerCase().indexOf('visual') >= 0;
}

function isCollision(obj) {
  return obj.name && obj.name.toLowerCase().indexOf('collision') >= 0;
}

function isVisualOrCollision(obj) {
  return isVisual(obj) || isCollision(obj);
}

// 辅助函数：判断是否是简单几何体
function isSimpleShape(obj, type) {
  const name = obj.name || '';
  const baseName = name.replace(/(_\d+)?$/, '').toLowerCase();
  console.log("isSimpleShape:",name,baseName);
  if (type === 'box') {
    return baseName === 'box' || baseName === 'unit_box';
  } else if (type === 'sphere') {
    return baseName === 'sphere' || baseName === 'unit_sphere';
  } else if (type === 'cylinder') {
    return baseName === 'cylinder' || baseName === 'unit_cylinder';
  }
  
  return false;
}

// 辅助函数：判断是否是网格模型
function isMeshModel(obj) {
  const name = obj.name || '';
  const baseName = name.replace(/(_\d+)?$/, '').toLowerCase();
  
  // 排除简单几何体
  if (isSimpleShape(obj, 'box') || isSimpleShape(obj, 'sphere') || isSimpleShape(obj, 'cylinder')) {
    return false;
  }
  
  // 已知的复合模型列表（由简单几何体组成）
  const compositeModels = [
    'bookshelf', 'table', 'table_marble'
    // 可以添加更多已知的复合模型
  ];
  
  // 如果是已知的复合模型，则不当作网格模型处理
  for (const model of compositeModels) {
    if (baseName === model) {
      return false;
    }
  }
  
  // 已知的网格模型列表
  const meshModels = [
    'fast_food', 'gas_station', 'cafe', 'house',
    'ambulance', 'person_standing', 'person_walking'
    // 其他网格模型...
  ];
  
  for (const model of meshModels) {
    if (baseName.indexOf(model) >= 0) {
      return true;
    }
  }
  
  // 检查obj是否有子对象，有多个子对象的可能是复合模型
  if (obj.children && obj.children.length > 1) {
    return false; // 可能是复合模型
  }
  
  // 默认处理
  return false;
}

function isCompositeModel(obj) {
  const name = obj.name || '';
  const baseName = name.replace(/(_\d+)?$/, '').toLowerCase();
  
  // 已知的复合模型列表
  const compositeModels = [
    'bookshelf', 'table', 'table_marble'
    // 添加更多已知的复合模型
  ];
  
  // 如果是已知的复合模型
  for (const model of compositeModels) {
    if (baseName === model) {
      return true;
    }
  }
  
  // 检查是否有多个子对象，暗示可能是复合模型
  if (obj.children && obj.children.length > 1) {
    return true;
  }
  
  return false;
}

// 模型名称验证和修正函数
function getValidModelName(modelName) {
  // 获取基础名称（去除数字后缀）
  const baseName = modelName.replace(/(_\d+)?$/, '').toLowerCase();
  
  // 1. 首先尝试找到完全匹配的目录
  if (modelDirectoryExists(baseName)) {
    return baseName;
  }
  
  // 2. 如果没有完全匹配，尝试在所有模型目录中查找包含当前名称的目录
  const similarName = findSimilarModelDirectory(baseName);
  if (similarName) {
    return similarName;
  }
  
  // 3. 如果还没找到，应用一些常见的命名模式转换规则
  // 例如：检查是否是部分名称（如"fast"可能是"fast_food"的一部分）
  const extendedName = extendPartialModelName(baseName);
  if (extendedName && extendedName !== baseName) {
    return extendedName;
  }
  
  // 4. 默认返回原始名称
  return baseName;
}

// 检查模型目录是否存在
function modelDirectoryExists(modelName) {
  // 在实际实现中，你可能需要调用系统API或根据assets的加载情况来检查
  // 这里用一个模拟的目录列表作为示例
  const availableDirectories = [
    'water_tower', 'walkway_metal_straight', 'fast_food', 'bookshelf',
    'ambulance', 'table', 'table_marble', 'person_standing', 'person_walking'
    // ... 添加assets目录中的所有模型目录
  ];
  
  return availableDirectories.includes(modelName);
}

// 查找类似的模型目录名
function findSimilarModelDirectory(modelName) {
  // 从assets目录获取的实际目录列表
  const availableDirectories = [
    'water_tower', 'walkway_metal_straight', 'fast_food', 'bookshelf',
    'ambulance', 'table', 'table_marble', 'person_standing', 'person_walking'
    // ... 添加assets目录中的所有模型目录
  ];
  
  
  // 1. 尝试完全匹配
  if (availableDirectories.includes(modelName)) {
    return modelName;
  }
  
  // 2. 检查是否是某个目录的子字符串
  for (const dir of availableDirectories) {
    if (dir.includes(modelName)) {
      return dir;
    }
  }
  
  // 3. 检查是否包含某个目录（反向匹配）
  for (const dir of availableDirectories) {
    if (modelName.includes(dir)) {
      return dir;
    }
  }
  
  return null;
}

// 扩展部分模型名称
function extendPartialModelName(partialName) {
  // 定义常见的模型名称扩展规则
  const commonExtensions = {
    'fast': 'fast_food',
    'gas': 'gas_station',
    'person': 'person_standing', // 默认扩展，可以在查找函数中更精确匹配
    'book': 'bookshelf',
    // 可以添加更多规则
  };
  
  return commonExtensions[partialName] || partialName;
}

// 改进后的复合模型导出函数
function exportComplexModelSDF(obj, indent = 0) {
  const indentStr = ' '.repeat(indent);
  let sdf = '';
  
  // 获取模型名称
  const fullName = obj.name || '';
  const modelName = fullName.replace(/(_\d+)?$/, '').toLowerCase();
  
  sdf += `${indentStr}<model name="${modelName}">\n`;
  sdf += `${indentStr}  <pose>${obj.position.x} ${obj.position.y} ${obj.position.z} 0 0 0</pose>\n`;
  sdf += `${indentStr}  <static>1</static>\n`;
  
  // 创建主链接
  sdf += `${indentStr}  <link name="link">\n`;
  
  // 添加基本惯性属性
  sdf += `${indentStr}    <inertial>\n`;
  sdf += `${indentStr}      <mass>1</mass>\n`;
  sdf += `${indentStr}    </inertial>\n`;
  
  // 查找并导出所有子部件
  const parts = findModelPartsWithTransforms(obj);
  
  // 为每个部件创建碰撞和视觉元素
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // 跳过不需要的子元素
    if (part.object.name && (part.object.name.includes('joint') || part.object.name.includes('helper'))) {
      continue;
    }
    
    // 使用计算好的相对变换
    const relPos = part.relativePosition;
    const relRot = part.relativeRotation;
    
    // 导出碰撞元素
    sdf += `${indentStr}    <collision name="collision_${i}">\n`;
    sdf += `${indentStr}      <pose>${relPos.x} ${relPos.y} ${relPos.z} ${relRot.x} ${relRot.y} ${relRot.z}</pose>\n`;
    sdf += `${indentStr}      <geometry>\n`;
    
    // 根据几何体类型导出不同的参数
    if (part.object.geometry && part.object.geometry.type === 'BoxGeometry') {
      const width = part.object.geometry.parameters.width || 1;
      const height = part.object.geometry.parameters.height || 1;
      const depth = part.object.geometry.parameters.depth || 1;
      
      sdf += `${indentStr}        <box>\n`;
      sdf += `${indentStr}          <size>${width} ${height} ${depth}</size>\n`;
      sdf += `${indentStr}        </box>\n`;
    } else if (part.object.geometry && part.object.geometry.type === 'SphereGeometry') {
      const radius = part.object.geometry.parameters.radius || 0.5;
      
      sdf += `${indentStr}        <sphere>\n`;
      sdf += `${indentStr}          <radius>${radius}</radius>\n`;
      sdf += `${indentStr}        </sphere>\n`;
    } else if (part.object.geometry && part.object.geometry.type === 'CylinderGeometry') {
      const radius = part.object.geometry.parameters.radiusTop || 0.5;
      const length = part.object.geometry.parameters.height || 1;
      
      sdf += `${indentStr}        <cylinder>\n`;
      sdf += `${indentStr}          <radius>${radius}</radius>\n`;
      sdf += `${indentStr}          <length>${length}</length>\n`;
      sdf += `${indentStr}        </cylinder>\n`;
    } else {
      // 默认为盒子 (1x1x1)
      sdf += `${indentStr}        <box>\n`;
      sdf += `${indentStr}          <size>0.2 0.2 0.2</size>\n`;
      sdf += `${indentStr}        </box>\n`;
    }
    
    sdf += `${indentStr}      </geometry>\n`;
    // 添加碰撞属性
    sdf += `${indentStr}      <max_contacts>10</max_contacts>\n`;
    sdf += `${indentStr}      <surface>\n`;
    sdf += `${indentStr}        <contact>\n`;
    sdf += `${indentStr}          <ode/>\n`;
    sdf += `${indentStr}        </contact>\n`;
    sdf += `${indentStr}        <bounce/>\n`;
    sdf += `${indentStr}        <friction>\n`;
    sdf += `${indentStr}          <torsional>\n`;
    sdf += `${indentStr}            <ode/>\n`;
    sdf += `${indentStr}          </torsional>\n`;
    sdf += `${indentStr}          <ode/>\n`;
    sdf += `${indentStr}        </friction>\n`;
    sdf += `${indentStr}      </surface>\n`;
    sdf += `${indentStr}    </collision>\n`;
    
    // 导出视觉元素
    sdf += `${indentStr}    <visual name="visual_${i}">\n`;
    sdf += `${indentStr}      <pose>${relPos.x} ${relPos.y} ${relPos.z} ${relRot.x} ${relRot.y} ${relRot.z}</pose>\n`;
    sdf += `${indentStr}      <geometry>\n`;
    
    // 使用与碰撞元素相同的几何体
    if (part.object.geometry && part.object.geometry.type === 'BoxGeometry') {
      const width = part.object.geometry.parameters.width || 1;
      const height = part.object.geometry.parameters.height || 1;
      const depth = part.object.geometry.parameters.depth || 1;
      
      sdf += `${indentStr}        <box>\n`;
      sdf += `${indentStr}          <size>${width} ${height} ${depth}</size>\n`;
      sdf += `${indentStr}        </box>\n`;
    } else if (part.object.geometry && part.object.geometry.type === 'SphereGeometry') {
      const radius = part.object.geometry.parameters.radius || 0.5;
      
      sdf += `${indentStr}        <sphere>\n`;
      sdf += `${indentStr}          <radius>${radius}</radius>\n`;
      sdf += `${indentStr}        </sphere>\n`;
    } else if (part.object.geometry && part.object.geometry.type === 'CylinderGeometry') {
      const radius = part.object.geometry.parameters.radiusTop || 0.5;
      const length = part.object.geometry.parameters.height || 1;
      
      sdf += `${indentStr}        <cylinder>\n`;
      sdf += `${indentStr}          <radius>${radius}</radius>\n`;
      sdf += `${indentStr}          <length>${length}</length>\n`;
      sdf += `${indentStr}        </cylinder>\n`;
    } else {
      // 默认为盒子 (1x1x1)
      sdf += `${indentStr}        <box>\n`;
      sdf += `${indentStr}          <size>0.2 0.2 0.2</size>\n`;
      sdf += `${indentStr}        </box>\n`;
    }
    
    sdf += `${indentStr}      </geometry>\n`;
    
    // 添加材质
    // 检查部件是否有材质
    if (part.object.material) {
      // 获取材质颜色
      const color = part.object.material.color ? 
        { r: part.object.material.color.r, g: part.object.material.color.g, b: part.object.material.color.b } : 
        { r: 0.8, g: 0.8, b: 0.8 };
        
      // 尝试获取材质名称
      let materialName = 'Gazebo/Grey';
      if (part.object.material.name && part.object.material.name.startsWith('Gazebo/')) {
        materialName = part.object.material.name;
      } else if (colorIsWood(color)) {
        materialName = 'Gazebo/Wood';
      }
      
      sdf += `${indentStr}      <material>\n`;
      sdf += `${indentStr}        <script>\n`;
      sdf += `${indentStr}          <uri>file://media/materials/scripts/gazebo.material</uri>\n`;
      sdf += `${indentStr}          <name>${materialName}</name>\n`;
      sdf += `${indentStr}        </script>\n`;
      sdf += `${indentStr}      </material>\n`;
    } else {
      // 使用默认材质
      sdf += `${indentStr}      <material>\n`;
      sdf += `${indentStr}        <script>\n`;
      sdf += `${indentStr}          <uri>file://media/materials/scripts/gazebo.material</uri>\n`;
      sdf += `${indentStr}          <name>Gazebo/Grey</name>\n`;
      sdf += `${indentStr}        </script>\n`;
      sdf += `${indentStr}      </material>\n`;
    }
    
    sdf += `${indentStr}    </visual>\n`;
  }
  
  // 如果没有找到任何部件，添加默认的碰撞和视觉元素
  if (parts.length === 0) {
    sdf += exportDefaultCollisionSDF(obj, indent + 4);
    sdf += exportDefaultVisualSDF(obj, indent + 4);
  }
  
  sdf += `${indentStr}    <self_collide>0</self_collide>\n`;
  sdf += `${indentStr}    <enable_wind>0</enable_wind>\n`;
  sdf += `${indentStr}    <kinematic>0</kinematic>\n`;
  sdf += `${indentStr}  </link>\n`;
  sdf += `${indentStr}</model>\n`;
  
  return sdf;
}

// 改进的函数，获取带有正确相对变换的模型部件
function findModelPartsWithTransforms(obj) {
  const parts = [];
  // 模型世界变换矩阵的逆矩阵，用于计算相对变换
  const modelMatrixInverse = new THREE.Matrix4();
  obj.updateMatrixWorld(true); // 确保世界矩阵是最新的
  
  // 在THREE.js中，逆矩阵方法是getInverse，而非invert
  modelMatrixInverse.getInverse(obj.matrixWorld);
  
  // 递归遍历对象的子层级
  function traverse(object) {
    // 检查是否有几何体
    if (object.geometry && (object instanceof THREE.Mesh)) {
      // 计算部件相对于模型的位置和旋转
      object.updateMatrixWorld(true); // 确保世界矩阵是最新的
      
      // 计算相对矩阵
      const relativeMatrix = new THREE.Matrix4();
      relativeMatrix.multiplyMatrices(modelMatrixInverse, object.matrixWorld);
      
      // 从矩阵中提取位置
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      relativeMatrix.decompose(position, quaternion, scale);
      
      // 从四元数转换为欧拉角（以弧度为单位）
      const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      
      parts.push({
        object: object,
        relativePosition: {
          x: position.x,
          y: position.y,
          z: position.z
        },
        relativeRotation: {
          x: euler.x,
          y: euler.y,
          z: euler.z
        },
        relativeScale: {
          x: scale.x,
          y: scale.y,
          z: scale.z
        }
      });
    }
    
    // 递归处理子对象
    if (object.children && object.children.length > 0) {
      object.children.forEach(child => traverse(child));
    }
  }
  
  traverse(obj);
  return parts;
}

// 检查颜色是否接近木头颜色
function colorIsWood(color) {
  // 木头颜色的范围（棕色）
  return (color.r > 0.5 && color.g > 0.25 && color.g < 0.6 && color.b < 0.3);
}

// 修改exportModelSDF函数，使用通用的复合模型导出
// function exportModelSDF(obj, indent = 0) {
//   const fullName = obj.name || '';
//   const modelName = fullName.replace(/(_\d+)?$/, '').toLowerCase();
  
//   // 判断是否为复合模型
//   if (isCompositeModel(obj)) {
//     return exportComplexModelSDF(obj, indent);
//   }
  
//   // 剩余的处理保持不变...
//   const indentStr = ' '.repeat(indent);
//   let sdf = '';
  
//   sdf += `${indentStr}<model name="${modelName}">\n`;
//   sdf += `${indentStr}  <pose>${obj.position.x} ${obj.position.y} ${obj.position.z} 0 0 0</pose>\n`;
  
//   // 为基本几何体或网格模型导出链接
//   sdf += exportLinkSDF(obj, indent + 2);
  
//   sdf += `${indentStr}</model>\n`;
//   return sdf;
// }

/**
 * 通用获取模型缩放比例的函数
 * 会尝试多种方法获取模型的原始缩放比例
 * @param {string} modelName - 模型名称
 * @param {object} obj - 模型对象
 * @returns {object} - 包含x, y, z缩放值的对象
 */
function getModelScale(modelName, obj) {
  // 默认缩放比例
  const defaultScale = { x: 1, y: 1, z: 1 };
  
  // 1. 首先检查是否在对象的userData中保存了缩放信息
  if (obj.userData && obj.userData.originalScale) {
    console.log("nice job");
    return {
      x: obj.userData.originalScale.x || 1,
      y: obj.userData.originalScale.y || 1,
      z: obj.userData.originalScale.z || 1
    };
  }
  
  // 2. 从模型的manifest.xml文件中读取缩放信息
  const scale = readScaleFromManifest(modelName);
  if (scale) {
    return scale;
  }
  
  // 3. 从模型的SDF文件中读取缩放信息
  const sdfScale = readScaleFromSDF(modelName);
  if (sdfScale) {
    return sdfScale;
  }
  
  // 4. 使用当前对象的缩放属性（如果有效）
  if (obj.scale && obj.scale.x && obj.scale.y && obj.scale.z) {
    // 如果缩放不是默认值，则返回
    if (obj.scale.x !== 1 || obj.scale.y !== 1 || obj.scale.z !== 1) {
      return {
        x: obj.scale.x,
        y: obj.scale.y,
        z: obj.scale.z
      };
    }
  }
  
  // 5. 根据模型类型返回合理的默认值
  const typeBasedScale = getScaleByModelType(modelName);
  if (typeBasedScale) {
    return typeBasedScale;
  }
  
  // 6. 如果以上方法都失败，返回默认缩放
  return defaultScale;
}

/**
 * 从模型的manifest.xml文件中读取缩放信息
 * @param {string} modelName - 模型名称
 * @returns {object|null} - 包含缩放信息的对象，或null
 */
function readScaleFromManifest(modelName) {
  // 获取模型目录路径
  const modelPath = `assets/${modelName}`;
  
  try {
    // 尝试读取模型的manifest.xml文件
    // 注意：这里假设我们在浏览器环境下运行，需要使用异步方式
    // 在实际实现中，你可能需要使用同步方法或缓存机制
    
    // 使用缓存的manifest数据
    if (window.manifestCache && window.manifestCache[modelName]) {
      const manifestData = window.manifestCache[modelName];
      if (manifestData.scale) {
        return {
          x: parseFloat(manifestData.scale.x) || 1,
          y: parseFloat(manifestData.scale.y) || 1,
          z: parseFloat(manifestData.scale.z) || 1
        };
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to read scale from manifest for model ${modelName}:`, error);
    return null;
  }
}

/**
 * 从模型的SDF文件中读取缩放信息
 * @param {string} modelName - 模型名称
 * @returns {object|null} - 包含缩放信息的对象，或null
 */
function readScaleFromSDF(modelName) {
  // 获取模型目录路径
  const modelPath = `assets/${modelName}`;
  
  try {
    // 尝试读取模型的model.sdf文件
    // 注意：这里假设我们在浏览器环境下运行，需要使用异步方式
    // 在实际实现中，你可能需要使用同步方法或缓存机制
    
    // 使用缓存的SDF数据
    if (window.sdfCache && window.sdfCache[modelName]) {
      const sdfData = window.sdfCache[modelName];
      
      // 解析SDF中的缩放信息
      // 这里假设SDF已经被解析为可操作的对象
      if (sdfData.model && sdfData.model.link && sdfData.model.link.visual) {
        const visual = sdfData.model.link.visual;
        if (visual.geometry && visual.geometry.mesh && visual.geometry.mesh.scale) {
          const scaleStr = visual.geometry.mesh.scale;
          const scaleParts = scaleStr.split(/\s+/);
          if (scaleParts.length >= 3) {
            return {
              x: parseFloat(scaleParts[0]) || 1,
              y: parseFloat(scaleParts[1]) || 1,
              z: parseFloat(scaleParts[2]) || 1
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to read scale from SDF for model ${modelName}:`, error);
    return null;
  }
}

/**
 * 根据模型类型返回合理的默认缩放值
 * @param {string} modelName - 模型名称
 * @returns {object|null} - 包含缩放信息的对象，或null
 */
function getScaleByModelType(modelName) {
  // 根据模型名称中的关键词判断模型类型
  console.log("getScaleByModelType");
  const name = modelName.toLowerCase();
  
  // 建筑类模型通常较大
  if (name.includes('building') || name.includes('house') || 
      name.includes('station') || name.includes('office') ||
      name.includes('store') || name.includes('cafe') ||
      name.includes('fast_food')) {
    return { x: 3, y: 3, z: 2 };
  }
  
  // 车辆类模型通常中等大小
  if (name.includes('car') || name.includes('truck') || 
      name.includes('vehicle') || name.includes('ambulance') ||
      name.includes('bus')) {
    return { x: 1.5, y: 1.5, z: 1.5 };
  }
  
  // 人物模型通常较小
  if (name.includes('person') || name.includes('human') ||
      name.includes('walking') || name.includes('standing')) {
    return { x: 1, y: 1, z: 1 };
  }
  
  // 家具类模型通常中等大小
  if (name.includes('table') || name.includes('chair') ||
      name.includes('desk') || name.includes('shelf') ||
      name.includes('bookshelf')) {
    return { x: 1.2, y: 1.2, z: 1.2 };
  }
  
  return null;
}

// 修改exportGeometrySDF函数，使用通用的getModelScale函数
function exportGeometrySDF(obj, indent = 0) {
  const indentStr = ' '.repeat(indent);
  let sdf = '';
  
  if (isSimpleShape(obj, 'box')) {
    sdf += `${indentStr}<box>\n`;
    sdf += `${indentStr}  <size>1 1 1</size>\n`;
    sdf += `${indentStr}</box>\n`;
  } else if (isSimpleShape(obj, 'sphere')) {
    sdf += `${indentStr}<sphere>\n`;
    sdf += `${indentStr}  <radius>0.5</radius>\n`;
    sdf += `${indentStr}</sphere>\n`;
  } else if (isSimpleShape(obj, 'cylinder')) {
    sdf += `${indentStr}<cylinder>\n`;
    sdf += `${indentStr}  <radius>0.5</radius>\n`;
    sdf += `${indentStr}  <length>1</length>\n`;
    sdf += `${indentStr}</cylinder>\n`;
  } else if (isMeshModel(obj)) {
    // 获取有效的模型名称，确保URI正确
    const modelName = getValidModelName(obj.name);
    
    sdf += `${indentStr}<mesh>\n`;
    sdf += `${indentStr}  <uri>model://${modelName}/meshes/${modelName}.dae</uri>\n`;
    
    // 使用通用函数获取模型缩放
    const scale = getModelScale(modelName, obj);
    
    sdf += `${indentStr}  <scale>${scale.x} ${scale.y} ${scale.z}</scale>\n`;
    sdf += `${indentStr}</mesh>\n`;
  } else {
    // 默认为盒子模型
    sdf += `${indentStr}<box>\n`;
    sdf += `${indentStr}  <size>1 1 1</size>\n`;
    sdf += `${indentStr}</box>\n`;
  }
  
  return sdf;
}

/**
 * 在模型加载时保存缩放信息
 * 这个函数应该在模型加载过程中调用
 * @param {object} obj - 加载的模型对象
 * @param {string} modelName - 模型名称
 */
function saveModelScaleInfo(obj, modelName) {
  // 获取模型的原始缩放信息
  const scale = getModelScale(modelName, obj);
  
  // 保存到对象的userData中，以便后续导出时使用
  if (!obj.userData) {
    obj.userData = {};
  }
  
  obj.userData.originalScale = scale;
  
  // 应用缩放
  obj.scale.set(scale.x, scale.y, scale.z);
}

// 建立一个缓存系统，用于存储已读取的模型缩放信息
if (typeof window !== 'undefined' && !window.modelScaleCache) {
  window.modelScaleCache = {};
  window.manifestCache = {};
  window.sdfCache = {};
}

/**
 * 将模型缩放信息添加到缓存
 * @param {string} modelName - 模型名称
 * @param {object} scale - 缩放信息对象
 */
function cacheModelScale(modelName, scale) {
  if (typeof window !== 'undefined') {
    window.modelScaleCache[modelName] = scale;
  }
}

/**
 * 从缓存中获取模型缩放信息
 * @param {string} modelName - 模型名称
 * @returns {object|null} - 缩放信息对象，如果不存在则返回null
 */
function getModelScaleFromCache(modelName) {
  if (typeof window !== 'undefined' && window.modelScaleCache[modelName]) {
    return window.modelScaleCache[modelName];
  }
  return null;
}

/**
 * 改进的保存模型变换信息函数
 * 确保正确保存包括z轴在内的所有位置信息
 * @param {THREE.Object3D} obj - 加载的模型对象
 * @param {string} [modelUri] - 模型URI，用于查找原始缩放信息
 */
GZ3D.Scene.prototype.saveModelTransformInfo = function(obj, modelUri) {
  // 如果对象为空，直接返回
  if (!obj) {
    return;
  }
  
  // 确保userData对象存在
  if (!obj.userData) {
    obj.userData = {};
  }
  
  // 更新模型的世界矩阵
  obj.updateMatrixWorld(true);
  
  // 获取当前的世界位置和旋转
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  
  // 分解世界矩阵以获取精确的世界坐标位置和旋转
  obj.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
  
  // 保存当前的缩放信息
  obj.userData.originalScale = {
    x: worldScale.x,
    y: worldScale.y,
    z: worldScale.z
  };
  
  // 保存当前的世界位置信息
  obj.userData.originalPosition = {
    x: worldPosition.x,
    y: worldPosition.y,
    z: worldPosition.z
  };
  
  // 保存当前的世界旋转信息
  obj.userData.originalQuaternion = {
    x: worldQuaternion.x,
    y: worldQuaternion.y,
    z: worldQuaternion.z,
    w: worldQuaternion.w
  };
  
  // 保存模型URI
  if (modelUri) {
    obj.userData.modelUri = modelUri;
  }
  
  console.log(`保存模型[${obj.name}]变换信息: position=${worldPosition.x},${worldPosition.y},${worldPosition.z} scale=${worldScale.x},${worldScale.y},${worldScale.z}`);
};
