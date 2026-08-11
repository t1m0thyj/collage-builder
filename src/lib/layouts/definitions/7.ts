import type { LayoutPresetDefinition } from '../../domain/types'

export const layout7Presets: LayoutPresetDefinition[] = [
  {
    "id": "layout-7-001",
    "revision": 1,
    "name": "Layout 1",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "split",
      "axis": "x",
      "weights": [
        0.2,
        0.5714285714285714,
        0.2
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
          "kind": "leaf",
          "key": "cell-4"
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
              "key": "cell-5"
            },
            {
              "kind": "leaf",
              "key": "cell-6"
            },
            {
              "kind": "leaf",
              "key": "cell-7"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "layout-7-002",
    "revision": 1,
    "name": "Layout 2",
    "frameCount": 7,
    "tags": [
      "asymmetric"
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
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 1,
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
        }
      ]
    }
  },
  {
    "id": "layout-7-003",
    "revision": 1,
    "name": "Layout 3",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 12,
      "rows": 2,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 4,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 4,
          "y": 0,
          "width": 4,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 8,
          "y": 0,
          "width": 4,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 3,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 6,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 9,
          "y": 1,
          "width": 3,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-004",
    "revision": 1,
    "name": "Layout 4",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 3,
      "rows": 9,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 2,
          "width": 3,
          "height": 5
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 7,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 1,
          "y": 7,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 7,
          "width": 1,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-7-005",
    "revision": 1,
    "name": "Layout 5",
    "frameCount": 7,
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
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 3,
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
          "x": 3,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 2,
          "width": 2,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-006",
    "revision": 1,
    "name": "Layout 6",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 3,
      "rows": 9,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 5
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 2,
          "height": 5
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 5,
          "width": 1,
          "height": 4
        },
        {
          "key": "cell-4",
          "x": 1,
          "y": 5,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-5",
          "x": 2,
          "y": 5,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 1,
          "y": 7,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 7,
          "width": 1,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-7-007",
    "revision": 1,
    "name": "Layout 7",
    "frameCount": 7,
    "tags": [
      "asymmetric"
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
          "width": 2,
          "height": 1
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
          "x": 0,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 1,
          "y": 1,
          "width": 1,
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
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 1,
          "y": 2,
          "width": 2,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-008",
    "revision": 1,
    "name": "Layout 8",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "split",
      "axis": "x",
      "weights": [
        0.16666666666666666,
        0.16666666666666666,
        0.16666666666666666,
        0.16666666666666666,
        0.16666666666666666,
        0.16666666666666666,
        0.16666666666666666
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
        },
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
        },
        {
          "kind": "leaf",
          "key": "cell-7"
        }
      ]
    }
  },
  {
    "id": "layout-7-009",
    "revision": 1,
    "name": "Layout 9",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 3,
      "rows": 4,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 3,
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
          "x": 0,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 1,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 3,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-010",
    "revision": 1,
    "name": "Layout 10",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 4,
      "rows": 9,
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
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 3,
          "y": 0,
          "width": 1,
          "height": 4
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-5",
          "x": 1,
          "y": 2,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 2,
          "y": 2,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 4,
          "width": 4,
          "height": 5
        }
      ]
    }
  },
  {
    "id": "layout-7-011",
    "revision": 1,
    "name": "Layout 11",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 7,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-4",
          "x": 3,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-5",
          "x": 4,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 5,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 2,
          "width": 6,
          "height": 5
        }
      ]
    }
  },
  {
    "id": "layout-7-012",
    "revision": 1,
    "name": "Layout 12",
    "frameCount": 7,
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
          "height": 2
        },
        {
          "key": "cell-2",
          "x": 1,
          "y": 0,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 2,
          "y": 0,
          "width": 2,
          "height": 2
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
          "height": 3
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 3,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-7",
          "x": 1,
          "y": 3,
          "width": 1,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-7-013",
    "revision": 1,
    "name": "Layout 13",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 3,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 3,
          "y": 0,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 3,
          "y": 1,
          "width": 3,
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
        }
      ]
    }
  },
  {
    "id": "layout-7-014",
    "revision": 1,
    "name": "Layout 14",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 3,
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
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 3,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 2,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 3,
          "y": 2,
          "width": 3,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-015",
    "revision": 1,
    "name": "Layout 15",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 12,
      "rows": 2,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 3,
          "y": 0,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-3",
          "x": 6,
          "y": 0,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 9,
          "y": 0,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 0,
          "y": 1,
          "width": 4,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 4,
          "y": 1,
          "width": 4,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 8,
          "y": 1,
          "width": 4,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-016",
    "revision": 1,
    "name": "Layout 16",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "split",
      "axis": "x",
      "weights": [
        0.5,
        0.5
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
            0.25,
            0.25,
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
            },
            {
              "kind": "leaf",
              "key": "cell-7"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "layout-7-017",
    "revision": 1,
    "name": "Layout 17",
    "frameCount": 7,
    "tags": [
      "asymmetric"
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
          "height": 2
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
          "x": 1,
          "y": 1,
          "width": 2,
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
        }
      ]
    }
  },
  {
    "id": "layout-7-018",
    "revision": 1,
    "name": "Layout 18",
    "frameCount": 7,
    "tags": [
      "asymmetric"
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
          "height": 3
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
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 1,
          "y": 2,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-019",
    "revision": 1,
    "name": "Layout 19",
    "frameCount": 7,
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
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-2",
          "x": 2,
          "y": 0,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 1,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 1,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 2,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 3,
          "y": 2,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-020",
    "revision": 1,
    "name": "Layout 20",
    "frameCount": 7,
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
          "height": 2
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
          "height": 2
        },
        {
          "key": "cell-4",
          "x": 3,
          "y": 0,
          "width": 1,
          "height": 3
        },
        {
          "key": "cell-5",
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 0,
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
        }
      ]
    }
  },
  {
    "id": "layout-7-021",
    "revision": 1,
    "name": "Layout 21",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 3,
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
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-5",
          "x": 3,
          "y": 1,
          "width": 3,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 0,
          "y": 2,
          "width": 4,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 4,
          "y": 2,
          "width": 2,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-022",
    "revision": 1,
    "name": "Layout 22",
    "frameCount": 7,
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
          "height": 4
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
          "x": 2,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 3,
          "y": 1,
          "width": 1,
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
          "x": 2,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 3,
          "y": 3,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-023",
    "revision": 1,
    "name": "Layout 23",
    "frameCount": 7,
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
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 3,
          "width": 2,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-024",
    "revision": 1,
    "name": "Layout 24",
    "frameCount": 7,
    "tags": [
      "asymmetric"
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
          "x": 0,
          "y": 2,
          "width": 2,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 2,
          "y": 2,
          "width": 1,
          "height": 1
        }
      ]
    }
  },
  {
    "id": "layout-7-025",
    "revision": 1,
    "name": "Layout 25",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 3,
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
          "width": 3,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-7-026",
    "revision": 1,
    "name": "Layout 26",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 3,
      "rows": 6,
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
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 0,
          "y": 1,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-4",
          "x": 0,
          "y": 2,
          "width": 2,
          "height": 2
        },
        {
          "key": "cell-5",
          "x": 2,
          "y": 2,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-6",
          "x": 2,
          "y": 3,
          "width": 1,
          "height": 1
        },
        {
          "key": "cell-7",
          "x": 0,
          "y": 4,
          "width": 3,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-7-027",
    "revision": 1,
    "name": "Layout 27",
    "frameCount": 7,
    "tags": [
      "uniform"
    ],
    "root": {
      "kind": "grid",
      "columns": 1,
      "rows": 7,
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
        }
      ]
    }
  },
  {
    "id": "layout-7-028",
    "revision": 1,
    "name": "Layout 28",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 6,
      "rows": 7,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 6,
          "height": 5
        },
        {
          "key": "cell-2",
          "x": 0,
          "y": 5,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-3",
          "x": 1,
          "y": 5,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-4",
          "x": 2,
          "y": 5,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-5",
          "x": 3,
          "y": 5,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-6",
          "x": 4,
          "y": 5,
          "width": 1,
          "height": 2
        },
        {
          "key": "cell-7",
          "x": 5,
          "y": 5,
          "width": 1,
          "height": 2
        }
      ]
    }
  },
  {
    "id": "layout-7-029",
    "revision": 1,
    "name": "Layout 29",
    "frameCount": 7,
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
            0.5,
            0.5
          ],
          "children": [
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
            0.6666666666666666,
            0.3333333333333333
          ],
          "children": [
            {
              "kind": "leaf",
              "key": "cell-6"
            },
            {
              "kind": "leaf",
              "key": "cell-7"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "layout-7-030",
    "revision": 1,
    "name": "Layout 30",
    "frameCount": 7,
    "tags": [
      "asymmetric"
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
          "height": 3
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
          "x": 1,
          "y": 1,
          "width": 1,
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
        }
      ]
    }
  },
  {
    "id": "layout-7-031",
    "revision": 1,
    "name": "Layout 31",
    "frameCount": 7,
    "tags": [
      "asymmetric"
    ],
    "root": {
      "kind": "grid",
      "columns": 4,
      "rows": 2,
      "cells": [
        {
          "key": "cell-1",
          "x": 0,
          "y": 0,
          "width": 1,
          "height": 2
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
          "x": 3,
          "y": 1,
          "width": 1,
          "height": 1
        }
      ]
    }
  }
]
