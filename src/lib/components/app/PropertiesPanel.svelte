<script lang="ts">
  import {
    ChevronDown,
    FlipHorizontal,
    FlipVertical,
    Link2,
    Link2Off,
    Palette,
    RotateCcw,
    RotateCw,
    WandSparkles,
  } from '@lucide/svelte'
  import type { PageStyleControl, StyleEditResult } from '../../app/pageActions'
  import type { PageV1, SlotContentV1 } from '../../domain/types'
  import { maxPageDimension, minPageDimension } from '../../domain/pageLimits'
  import { pageSpacingLimits } from '../../domain/pageStyle'
  import * as Collapsible from '../ui/collapsible'
  import * as Popover from '../ui/popover'
  import * as Slider from '../ui/slider'
  import * as Switch from '../ui/switch'

  export let activePage: PageV1
  export let selectedSlotId: string | null
  export let selectedContent: SlotContentV1 | null
  export let selectedImageName: string | undefined
  export let pageAspectLinked: boolean
  export let colorPresets: string[]
  export let recentColors: string[]
  export let cropModeSlotId: string | null
  export let cropZoom: number
  export let onresizepage: (axis: 'width' | 'height', value: number) => void
  export let onupdatestyle: (patch: Partial<PageV1['style']>) => StyleEditResult
  export let onpreviewstyle: (
    control: PageStyleControl,
    patch: Partial<PageV1['style']>,
  ) => StyleEditResult
  export let oncommitstyle: (control: PageStyleControl) => void
  export let onsetbackground: (color: string, rememberCustom?: boolean) => void
  export let onremembercolor: (color: string) => void
  export let onsuggestbackground: () => void
  export let suggestingBackground: boolean
  export let onsetshadow: (color: string, rememberCustom?: boolean) => void
  export let shadowDistance: () => number
  export let shadowAngle: () => number
  export let onupdateshadowpolar: (distance?: number, angle?: number) => void
  export let onpreviewshadowpolar: (
    control: 'shadow.distance' | 'shadow.angle',
    distance?: number,
    angle?: number,
  ) => void
  export let onrequestimage: (slotId: string) => void
  export let onbegincrop: (slotId: string) => void
  export let onupdatecropzoom: (zoom: number) => void
  export let onrotatephoto: (quarterTurns: -1 | 1) => void
  export let onflipphoto: (axis: 'horizontal' | 'vertical') => void
  export let onupdatecropposition: (axis: 'positionX' | 'positionY', percent: number) => void
  export let onfinishcrop: () => void
  export let onresetcrop: () => void
  export let onremoveimage: () => void

  function previewBackground(color: string) {
    onpreviewstyle('backgroundColor', { backgroundColor: `${color.toUpperCase()}FF` })
  }

  function commitBackground(color: string) {
    if (activePage.style.backgroundColor.slice(0, 7) !== color.toUpperCase())
      previewBackground(color)
    oncommitstyle('backgroundColor')
    onremembercolor(color)
  }

  function previewShadowColor(color: string) {
    onpreviewstyle('shadow.color', {
      shadow: { ...activePage.style.shadow, color: color.toUpperCase() },
    })
  }

  function commitShadowColor(color: string) {
    if (activePage.style.shadow.color !== color.toUpperCase()) previewShadowColor(color)
    oncommitstyle('shadow.color')
    onremembercolor(color)
  }

  let spacingError: { pageId: string; control: 'padding' | 'gap'; message: string } | null = null
  $: spacingLimits = pageSpacingLimits(activePage)
  $: if (spacingError && spacingError.pageId !== activePage.id) spacingError = null

  function applySpacing(control: 'padding' | 'gap', value: number, preview = false) {
    const result = preview
      ? onpreviewstyle(control, { [control]: value })
      : onupdatestyle({ [control]: value })
    spacingError = result.ok
      ? null
      : {
          pageId: activePage.id,
          control,
          message: `${result.message}. Choose ${control === 'padding' ? 'an outer margin' : 'inner spacing'} between 0 and ${spacingLimits[control]} px for this page and layout.`,
        }
  }

  function editSpacing(event: Event, control: 'padding' | 'gap') {
    const input = event.currentTarget as HTMLInputElement
    applySpacing(control, Number(input.value))
    input.value = String(activePage.style[control])
  }

  function resizeDimension(event: Event, axis: 'width' | 'height') {
    const input = event.currentTarget as HTMLInputElement
    onresizepage(axis, Number(input.value))
    // A rejected edit does not publish a new page, so restore the DOM draft too.
    input.value = String(activePage[axis])
  }
</script>

<aside class="sidebar right-panel" aria-label="Properties">
  <div class="panel-heading">
    <p class="eyebrow">
      Properties{selectedSlotId
        ? ` · Frame ${Object.keys(activePage.slots).indexOf(selectedSlotId) + 1}`
        : ''}
    </p>
    {#if selectedSlotId && selectedImageName}
      <p class="selected-image-name">{selectedImageName}</p>
    {/if}
  </div>
  <div class="property-groups">
    {#if selectedSlotId && !selectedContent}
      <Collapsible.Root class="property-group selected-properties" open
        ><div class="property-group-heading">
          <Collapsible.Trigger
            >Selected frame <ChevronDown size={14} aria-hidden="true"
            ></ChevronDown></Collapsible.Trigger
          >
        </div>
        <Collapsible.Content
          ><div class="frame-action">
            <button class="button button-primary" onclick={() => onrequestimage(selectedSlotId!)}
              >Add image</button
            >
          </div></Collapsible.Content
        ></Collapsible.Root
      >
    {:else if selectedSlotId && selectedContent}
      <Collapsible.Root class="property-group selected-properties" open
        ><div class="property-group-heading">
          <Collapsible.Trigger
            >Image & crop <ChevronDown size={14} aria-hidden="true"
            ></ChevronDown></Collapsible.Trigger
          >
        </div>
        <Collapsible.Content
          ><div class="crop-controls">
            {#if cropModeSlotId === selectedSlotId}<p class="crop-hint">
                Crop mode is active. Drag the image, use the handles or Alt+wheel to zoom, or adjust
                values precisely. Enter accepts; Escape cancels.
              </p>{:else}<button class="button" onclick={() => onbegincrop(selectedSlotId!)}
                >Crop image</button
              >
              <p class="crop-hint">
                Double-click the image, press Enter, or use Crop image to begin.
              </p>{/if}
            <div class="crop-zoom">
              <span>Zoom</span>
              <div class="inspector-slider">
                <input
                  class="crop-zoom-slider"
                  aria-label="Crop zoom"
                  type="range"
                  min="1"
                  max="8"
                  step="0.01"
                  value={cropZoom}
                  oninput={(event) => onupdatecropzoom(Number(event.currentTarget.value))}
                /><input
                  class="slider-value"
                  aria-label="Crop zoom value"
                  type="number"
                  min="1"
                  max="8"
                  step="0.01"
                  value={cropZoom.toFixed(2)}
                  onchange={(event) =>
                    onupdatecropzoom(Math.min(8, Math.max(1, Number(event.currentTarget.value))))}
                />
              </div>
            </div>
            <div class="crop-orientation" role="group" aria-label="Photo orientation">
              <span>Orientation</span>
              <div class="crop-orientation-actions">
                <button
                  class="button"
                  aria-label="Rotate photo left 90 degrees"
                  title="Rotate left 90°"
                  onclick={() => onrotatephoto(-1)}><RotateCcw size={15}></RotateCcw></button
                >
                <output>{selectedContent.placement.rotation ?? 0}°</output>
                <button
                  class="button"
                  aria-label="Rotate photo right 90 degrees"
                  title="Rotate right 90°"
                  onclick={() => onrotatephoto(1)}><RotateCw size={15}></RotateCw></button
                >
                <button
                  class="button"
                  aria-label="Flip photo horizontally"
                  title="Flip horizontally"
                  aria-pressed={selectedContent.placement.flipHorizontal ?? false}
                  onclick={() => onflipphoto('horizontal')}
                  ><FlipHorizontal size={15}></FlipHorizontal></button
                >
                <button
                  class="button"
                  aria-label="Flip photo vertically"
                  title="Flip vertically"
                  aria-pressed={selectedContent.placement.flipVertical ?? false}
                  onclick={() => onflipphoto('vertical')}
                  ><FlipVertical size={15}></FlipVertical></button
                >
              </div>
            </div>
            <div class="crop-coordinates">
              <label
                >X <input
                  aria-label="Crop horizontal position"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(selectedContent.placement.positionX * 100)}
                  onchange={(event) =>
                    onupdatecropposition('positionX', Number(event.currentTarget.value))}
                />%</label
              ><label
                >Y <input
                  aria-label="Crop vertical position"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(selectedContent.placement.positionY * 100)}
                  onchange={(event) =>
                    onupdatecropposition('positionY', Number(event.currentTarget.value))}
                />%</label
              >
            </div>
            <div class="crop-actions">
              <button class="text-button" onclick={onresetcrop}>Reset crop</button
              >{#if cropModeSlotId === selectedSlotId}<button
                  class="button button-primary"
                  onclick={onfinishcrop}>Done</button
                >{/if}
            </div>
            <div class="image-actions">
              <button
                class="button image-action-button"
                onclick={() => onrequestimage(selectedSlotId!)}>Replace this frame</button
              ><button class="button image-action-button" onclick={onremoveimage}>Remove</button>
            </div>
          </div></Collapsible.Content
        ></Collapsible.Root
      >
    {/if}
    <div class="property-note">
      <p>
        {selectedContent
          ? cropModeSlotId === selectedSlotId
            ? 'Drag to reposition the photo. Drag a handle to zoom. Done accepts the crop.'
            : 'Click a photo to select it. Drag it to another frame to swap. Double-click to crop.'
          : 'Select a frame to adjust its photo or page settings.'}
      </p>
    </div>
    <Collapsible.Root class="property-group page-properties" open
      ><div class="property-group-heading">
        <Collapsible.Trigger
          >Page setup <ChevronDown size={14} aria-hidden="true"></ChevronDown></Collapsible.Trigger
        >
      </div>
      <Collapsible.Content
        ><div class="property-list">
          <div class="page-dimensions">
            <label>
              <span>Width</span><input
                aria-label="Page width"
                type="number"
                min={minPageDimension}
                max={maxPageDimension}
                value={activePage.width}
                onchange={(event) => resizeDimension(event, 'width')}
              />
            </label>
            <label>
              <span>Height</span><input
                aria-label="Page height"
                type="number"
                min={minPageDimension}
                max={maxPageDimension}
                value={activePage.height}
                onchange={(event) => resizeDimension(event, 'height')}
              />
            </label>
            <button
              class:active={pageAspectLinked}
              class="aspect-ratio-toggle"
              type="button"
              aria-label={pageAspectLinked ? 'Unlock page aspect ratio' : 'Lock page aspect ratio'}
              aria-pressed={pageAspectLinked}
              title={pageAspectLinked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              onclick={() => (pageAspectLinked = !pageAspectLinked)}
              >{#if pageAspectLinked}<Link2 size={15}></Link2>{:else}<Link2Off size={15}
                ></Link2Off>{/if}</button
            >
          </div>
          <div>
            <span>Transparent background</span><Switch.Root
              class="switch"
              aria-label="Transparent background"
              checked={activePage.style.transparentBackground}
              onCheckedChange={(transparentBackground) => onupdatestyle({ transparentBackground })}
            />
          </div>
        </div></Collapsible.Content
      ></Collapsible.Root
    >
    <Collapsible.Root class="property-group appearance-properties" open
      ><div class="property-group-heading">
        <Collapsible.Trigger
          >Frame appearance <ChevronDown size={14} aria-hidden="true"
          ></ChevronDown></Collapsible.Trigger
        >
      </div>
      <Collapsible.Content
        ><div class="property-list">
          <div class="background-color-row">
            <span>Background</span>
            <div class="background-color-controls">
              <Popover.Root
                ><Popover.Trigger
                  class="color-trigger"
                  aria-label="Choose background color"
                  disabled={activePage.style.transparentBackground}
                  ><i style={`background:${activePage.style.backgroundColor.slice(0, 7)}`}></i><span
                    >{activePage.style.backgroundColor.slice(0, 7)}</span
                  ></Popover.Trigger
                ><Popover.Content class="color-popover"
                  ><p class="color-popover-label">Presets</p>
                  <div class="color-presets" aria-label="Background color presets">
                    {#each colorPresets as color (color)}<button
                        class:active={activePage.style.backgroundColor.slice(0, 7) === color}
                        class="color-preset"
                        aria-label={`Set background to ${color}`}
                        title={color}
                        style={`background:${color}`}
                        onclick={() => onsetbackground(color)}
                      ></button>{/each}
                  </div>
                  <div class="color-picker-footer">
                    <div class="color-recents" aria-label="Recently used background colors">
                      {#each recentColors as color (color)}<button
                          class="color-preset"
                          aria-label={`Set background to recent ${color}`}
                          title={color}
                          style={`background:${color}`}
                          onclick={() => onsetbackground(color)}
                        ></button>{/each}
                    </div>
                    <label class="color-custom"
                      ><Palette size={15} aria-hidden="true" /><span>Custom</span><input
                        aria-label="Background color"
                        type="color"
                        value={activePage.style.backgroundColor.slice(0, 7)}
                        oninput={(event) => previewBackground(event.currentTarget.value)}
                        onchange={(event) => commitBackground(event.currentTarget.value)}
                      /></label
                    >
                  </div></Popover.Content
                ></Popover.Root
              ><button
                class="background-suggest-button"
                type="button"
                aria-label="Suggest background color from page photos"
                title="Suggest a background color from page photos"
                aria-busy={suggestingBackground}
                disabled={activePage.style.transparentBackground ||
                  suggestingBackground ||
                  !Object.values(activePage.slots).some(Boolean)}
                onclick={onsuggestbackground}
                ><WandSparkles size={16} aria-hidden="true"></WandSparkles></button
              >
            </div>
          </div>
          <div>
            <span>Outer margin</span>
            <div class="inspector-slider">
              <Slider.Root
                class="inspector-slider-root"
                aria-label="Outer margin"
                aria-invalid={spacingError?.control === 'padding' ? 'true' : undefined}
                aria-describedby={spacingError?.control === 'padding' ? 'padding-error' : undefined}
                type="single"
                min={0}
                max={spacingLimits.padding}
                step={1}
                value={activePage.style.padding}
                onValueChange={(padding) => applySpacing('padding', padding, true)}
                onValueCommit={() => oncommitstyle('padding')}
              /><input
                class="slider-value"
                aria-label="Outer margin value"
                aria-invalid={spacingError?.control === 'padding' ? 'true' : undefined}
                aria-describedby={spacingError?.control === 'padding' ? 'padding-error' : undefined}
                type="number"
                min="0"
                max={spacingLimits.padding}
                value={activePage.style.padding}
                onchange={(event) => editSpacing(event, 'padding')}
              />
            </div>
          </div>
          {#if spacingError?.control === 'padding'}<p
              id="padding-error"
              class="property-error"
              role="status"
            >
              {spacingError.message}
            </p>{/if}
          <div>
            <span>Inner spacing</span>
            <div class="inspector-slider">
              <Slider.Root
                class="inspector-slider-root"
                aria-label="Inner spacing"
                aria-invalid={spacingError?.control === 'gap' ? 'true' : undefined}
                aria-describedby={spacingError?.control === 'gap' ? 'gap-error' : undefined}
                type="single"
                min={0}
                max={spacingLimits.gap}
                step={1}
                value={activePage.style.gap}
                onValueChange={(gap) => applySpacing('gap', gap, true)}
                onValueCommit={() => oncommitstyle('gap')}
              /><input
                class="slider-value"
                aria-label="Inner spacing value"
                aria-invalid={spacingError?.control === 'gap' ? 'true' : undefined}
                aria-describedby={spacingError?.control === 'gap' ? 'gap-error' : undefined}
                type="number"
                min="0"
                max={spacingLimits.gap}
                value={activePage.style.gap}
                onchange={(event) => editSpacing(event, 'gap')}
              />
            </div>
          </div>
          {#if spacingError?.control === 'gap'}<p
              id="gap-error"
              class="property-error"
              role="status"
            >
              {spacingError.message}
            </p>{/if}
          <div>
            <span>Corner radius</span>
            <div class="inspector-slider">
              <Slider.Root
                class="inspector-slider-root"
                aria-label="Corner radius"
                type="single"
                min={0}
                max={120}
                step={1}
                value={activePage.style.cornerRadius}
                onValueChange={(cornerRadius) => onpreviewstyle('cornerRadius', { cornerRadius })}
                onValueCommit={() => oncommitstyle('cornerRadius')}
              /><input
                class="slider-value"
                aria-label="Corner radius value"
                type="number"
                min="0"
                max="120"
                value={activePage.style.cornerRadius}
                onchange={(event) =>
                  onupdatestyle({
                    cornerRadius: Math.min(120, Math.max(0, Number(event.currentTarget.value))),
                  })}
              />
            </div>
          </div>
          <div>
            <span>Frame shadow</span><Switch.Root
              class="switch"
              aria-label="Frame shadow enabled"
              checked={activePage.style.shadow.enabled}
              onCheckedChange={(enabled) =>
                onupdatestyle({ shadow: { ...activePage.style.shadow, enabled } })}
            />
          </div>
        </div></Collapsible.Content
      ></Collapsible.Root
    >
    {#if activePage.style.shadow.enabled}<Collapsible.Root class="property-group shadow-properties"
        ><div class="property-group-heading">
          <Collapsible.Trigger
            >Advanced shadow <ChevronDown size={14} aria-hidden="true"
            ></ChevronDown></Collapsible.Trigger
          >
        </div>
        <Collapsible.Content
          ><div class="property-list">
            <div>
              <span>Shadow color</span><Popover.Root
                ><Popover.Trigger class="color-trigger" aria-label="Choose frame shadow color"
                  ><i style={`background:${activePage.style.shadow.color}`}></i><span
                    >{activePage.style.shadow.color}</span
                  ></Popover.Trigger
                ><Popover.Content class="color-popover"
                  ><p class="color-popover-label">Presets</p>
                  <div class="color-presets" aria-label="Shadow color presets">
                    {#each colorPresets as color (color)}<button
                        class:active={activePage.style.shadow.color === color}
                        class="color-preset"
                        aria-label={`Set shadow to ${color}`}
                        title={color}
                        style={`background:${color}`}
                        onclick={() => onsetshadow(color)}
                      ></button>{/each}
                  </div>
                  <div class="color-picker-footer">
                    <div class="color-recents" aria-label="Recently used shadow colors">
                      {#each recentColors as color (color)}<button
                          class="color-preset"
                          aria-label={`Set shadow to recent ${color}`}
                          title={color}
                          style={`background:${color}`}
                          onclick={() => onsetshadow(color)}
                        ></button>{/each}
                    </div>
                    <label class="color-custom"
                      ><Palette size={15} aria-hidden="true" /><span>Custom</span><input
                        aria-label="Frame shadow color"
                        type="color"
                        value={activePage.style.shadow.color}
                        oninput={(event) => previewShadowColor(event.currentTarget.value)}
                        onchange={(event) => commitShadowColor(event.currentTarget.value)}
                      /></label
                    >
                  </div></Popover.Content
                ></Popover.Root
              >
            </div>
            <div class="slider-row-wide-label">
              <span>Opacity</span>
              <div class="inspector-slider">
                <Slider.Root
                  class="inspector-slider-root"
                  aria-label="Frame shadow opacity"
                  type="single"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(activePage.style.shadow.opacity * 100)}
                  onValueChange={(value) =>
                    onpreviewstyle('shadow.opacity', {
                      shadow: { ...activePage.style.shadow, opacity: value / 100 },
                    })}
                  onValueCommit={() => oncommitstyle('shadow.opacity')}
                /><input
                  class="slider-value"
                  aria-label="Frame shadow opacity value"
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(activePage.style.shadow.opacity * 100)}
                  onchange={(event) =>
                    onupdatestyle({
                      shadow: {
                        ...activePage.style.shadow,
                        opacity:
                          Math.min(100, Math.max(0, Number(event.currentTarget.value))) / 100,
                      },
                    })}
                />
              </div>
            </div>
            <div>
              <span>Shadow blur</span>
              <div class="inspector-slider">
                <Slider.Root
                  class="inspector-slider-root"
                  aria-label="Frame shadow blur"
                  type="single"
                  min={0}
                  max={50}
                  step={1}
                  value={activePage.style.shadow.blur}
                  onValueChange={(blur) =>
                    onpreviewstyle('shadow.blur', {
                      shadow: { ...activePage.style.shadow, blur },
                    })}
                  onValueCommit={() => oncommitstyle('shadow.blur')}
                /><input
                  class="slider-value"
                  aria-label="Frame shadow blur value"
                  type="number"
                  min="0"
                  max="50"
                  value={activePage.style.shadow.blur}
                  onchange={(event) =>
                    onupdatestyle({
                      shadow: {
                        ...activePage.style.shadow,
                        blur: Math.min(50, Math.max(0, Number(event.currentTarget.value))),
                      },
                    })}
                />
              </div>
            </div>
            <div>
              <span>Shadow distance</span>
              <div class="inspector-slider">
                <Slider.Root
                  class="inspector-slider-root"
                  aria-label="Frame shadow distance"
                  type="single"
                  min={0}
                  max={50}
                  step={1}
                  value={shadowDistance()}
                  onValueChange={(distance) => onpreviewshadowpolar('shadow.distance', distance)}
                  onValueCommit={() => oncommitstyle('shadow.distance')}
                /><input
                  class="slider-value"
                  aria-label="Frame shadow distance value"
                  type="number"
                  min="0"
                  max="50"
                  value={shadowDistance()}
                  onchange={(event) =>
                    onupdateshadowpolar(
                      Math.min(50, Math.max(0, Number(event.currentTarget.value))),
                    )}
                />
              </div>
            </div>
            <div>
              <span>Shadow angle</span>
              <div class="inspector-slider">
                <Slider.Root
                  class="inspector-slider-root"
                  aria-label="Frame shadow angle"
                  type="single"
                  min={0}
                  max={360}
                  step={1}
                  value={shadowAngle()}
                  onValueChange={(angle) => onpreviewshadowpolar('shadow.angle', undefined, angle)}
                  onValueCommit={() => oncommitstyle('shadow.angle')}
                /><input
                  class="slider-value"
                  aria-label="Frame shadow angle value"
                  type="number"
                  min="0"
                  max="360"
                  value={shadowAngle()}
                  onchange={(event) =>
                    onupdateshadowpolar(
                      undefined,
                      Math.min(360, Math.max(0, Number(event.currentTarget.value))),
                    )}
                />
              </div>
            </div>
          </div></Collapsible.Content
        ></Collapsible.Root
      >{/if}
  </div>
</aside>
