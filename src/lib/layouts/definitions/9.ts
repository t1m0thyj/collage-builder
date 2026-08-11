import type { LayoutPresetDefinition } from '../../domain/types'

export const layout9Presets: LayoutPresetDefinition[] = [
  {
    "id": "layout-9-001",
    "revision": 1,
    "name": "Layout 1",
    "frameCount": 9,
    "tags": [
      "uniform"
    ],
    "root": {
      "kind": "grid",
      "columns": 3,
      "rows": 3,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 2,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 1,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 2,
          "y": 2,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-002",
    "revision": 1,
    "name": "Layout 2",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "split",
      "axis": "x",
      "weights": [
        0.5,
        0.25,
        0.25
      ],
      "children": [
        {
          "kind": "leaf",
          "key": "cell-1"
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.25,
            0.25,
            0.25,
            0.25
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-2"
            },
            {
              "kind": "leaf",
              "key": "cell-3"
            },
            {
              "kind": "leaf",
              "key": "cell-4"
            },
            {
              "kind": "leaf",
              "key": "cell-5"
            }
          ]
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.25,
            0.25,
            0.25,
            0.25
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-6"
            },
            {
              "kind": "leaf",
              "key": "cell-7"
            },
            {
              "kind": "leaf",
              "key": "cell-8"
            },
            {
              "kind": "leaf",
              "key": "cell-9"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "layout-9-003",
    "revision": 1,
    "name": "Layout 3",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 10,
      "rows": 10,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 4,
          "height": 3
        },
        {
          "key": "cell-2",
          "x": 4,
          "y": 0,
          "width": 6,
          "height": 6
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 3,
          "width": 4,
          "height": 3
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 6,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-5",
          "x": 2,
          "y": 6,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 4,
          "y": 6,
          "width": 3,
          "height": 4
        },
        {
          "key": "cell-7",
          "x": 7,
          "y": 6,
          "width": 3,
          "height": 4
        },
        {
          "key": "cell-8",
          "x": 0,
          "y": 8,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-9",
          "x": 2,
          "y": 8,
          "width": 2,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-9-004",
    "revision": 1,
    "name": "Layout 4",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 4,
      "rows": 3,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 2,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 3,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 1,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 2,
          "y": 2,
          "width": 2,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-005",
    "revision": 1,
    "name": "Layout 5",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 2,
          "y": 0,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 4,
          "y": 0,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 2,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 4,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 2,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 3,
          "y": 2,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 0,
          "y": 3,
          "width": 6,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-006",
    "revision": 1,
    "name": "Layout 6",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "split",
      "axis": "x",
      "weights": [
        0.25,
        0.5,
        0.25
      ],
      "children": [
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.3333333333333333,
            0.3333333333333333,
            0.3333333333333333
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-1"
            },
            {
              "kind": "leaf",
              "key": "cell-2"
            },
            {
              "kind": "leaf",
              "key": "cell-3"
            }
          ]
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.3333333333333333,
            0.3333333333333333,
            0.3333333333333333
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-4"
            },
            {
              "kind": "leaf",
              "key": "cell-5"
            },
            {
              "kind": "leaf",
              "key": "cell-6"
            }
          ]
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.3333333333333333,
            0.3333333333333333,
            0.3333333333333333
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-7"
            },
            {
              "kind": "leaf",
              "key": "cell-8"
            },
            {
              "kind": "leaf",
              "key": "cell-9"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "layout-9-007",
    "revision": 1,
    "name": "Layout 7",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "split",
      "axis": "x",
      "weights": [
        0.3333333333333333,
        0.3333333333333333,
        0.3333333333333333
      ],
      "children": [
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.2,
            0.4,
            0.4
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-1"
            },
            {
              "kind": "leaf",
              "key": "cell-2"
            },
            {
              "kind": "leaf",
              "key": "cell-3"
            }
          ]
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.4,
            0.2,
            0.4
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-4"
            },
            {
              "kind": "leaf",
              "key": "cell-5"
            },
            {
              "kind": "leaf",
              "key": "cell-6"
            }
          ]
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.2,
            0.4,
            0.4
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-7"
            },
            {
              "kind": "leaf",
              "key": "cell-8"
            },
            {
              "kind": "leaf",
              "key": "cell-9"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "layout-9-008",
    "revision": 1,
    "name": "Layout 8",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 4,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 3,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 3,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 0,
          "y": 2,
          "width": 4,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-9-009",
    "revision": 1,
    "name": "Layout 9",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 5,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-2",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 3,
          "y": 0,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-4",
          "x": 2,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 1,
          "y": 2,
          "width": 3,
          "height": 2
        },
        {
          "key": "cell-7",
          "x": 4,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 0,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 4,
          "y": 3,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-010",
    "revision": 1,
    "name": "Layout 10",
    "frameCount": 9,
    "tags": [
      "uniform"
    ],
    "root": {
      "kind": "grid",
      "columns": 1,
      "rows": 9,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 0,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 4,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 5,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 6,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 0,
          "y": 7,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 0,
          "y": 8,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-011",
    "revision": 1,
    "name": "Layout 11",
    "frameCount": 9,
    "tags": [
      "uniform"
    ],
    "root": {
      "kind": "grid",
      "columns": 9,
      "rows": 1,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 3,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 4,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 5,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 6,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 7,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 8,
          "y": 0,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-012",
    "revision": 1,
    "name": "Layout 12",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 6,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-2",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 3,
          "y": 0,
          "width": 3,
          "height": 3
        },
        {
          "key": "cell-4",
          "x": 2,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 1,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 0,
          "y": 3,
          "width": 3,
          "height": 3
        },
        {
          "key": "cell-9",
          "x": 3,
          "y": 3,
          "width": 3,
          "height": 3
        }
      ]
    }
  },
  {
    "id": "layout-9-013",
    "revision": 1,
    "name": "Layout 13",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 8,
      "rows": 6,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 4,
          "height": 3
        },
        {
          "key": "cell-2",
          "x": 4,
          "y": 0,
          "width": 4,
          "height": 3
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 1,
          "y": 3,
          "width": 6,
          "height": 3
        },
        {
          "key": "cell-5",
          "x": 7,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 4,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 7,
          "y": 4,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 0,
          "y": 5,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 7,
          "y": 5,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-014",
    "revision": 1,
    "name": "Layout 14",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 4,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 2,
          "y": 0,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 1,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-4",
          "x": 1,
          "y": 1,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-5",
          "x": 3,
          "y": 1,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 1,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 2,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 3,
          "y": 3,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-015",
    "revision": 1,
    "name": "Layout 15",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 6,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 0,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 3,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 2,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 4,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 3,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 2,
          "y": 3,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 4,
          "y": 3,
          "width": 2,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-016",
    "revision": 1,
    "name": "Layout 16",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 4,
      "rows": 5,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 3,
          "y": 0,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 1,
          "width": 4,
          "height": 3
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 4,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 1,
          "y": 4,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 2,
          "y": 4,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 3,
          "y": 4,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-017",
    "revision": 1,
    "name": "Layout 17",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "split",
      "axis": "x",
      "weights": [
        0.5,
        0.25,
        0.25
      ],
      "children": [
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.5,
            0.25,
            0.25
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-1"
            },
            {
              "kind": "leaf",
              "key": "cell-2"
            },
            {
              "kind": "leaf",
              "key": "cell-3"
            }
          ]
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.5,
            0.25,
            0.25
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-4"
            },
            {
              "kind": "leaf",
              "key": "cell-5"
            },
            {
              "kind": "leaf",
              "key": "cell-6"
            }
          ]
        },
        {
          "kind": "split",
          "axis": "y",
          "weights": [
            0.5,
            0.25,
            0.25
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-7"
            },
            {
              "kind": "leaf",
              "key": "cell-8"
            },
            {
              "kind": "leaf",
              "key": "cell-9"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "layout-9-018",
    "revision": 1,
    "name": "Layout 18",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 6,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 0,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 4,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 2,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 4,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 0,
          "y": 3,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 3,
          "y": 3,
          "width": 3,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-9-019",
    "revision": 1,
    "name": "Layout 19",
    "frameCount": 9,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 4,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 4,
          "height": 2
        },
        {
          "key": "cell-2",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 1,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 2,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 3,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 1,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-8",
          "x": 2,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-9",
          "x": 3,
          "y": 3,
          "width": 1,
          "height": 1
        }
      ]
    }
  }
]
