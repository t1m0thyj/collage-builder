<script lang="ts">
  import { ChevronDown, Link2, Link2Off, Palette } from '@lucide/svelte'
  import type { PageStyleControl } from '../../app/pageActions'
  import type { PageV1, SlotContentV1 } from '../../domain/types'
  import * as Collapsible from '../ui/collapsible'
  import * as Popover from '../ui/popover'
  import * as Slider from '../ui/slider'
  import * as Switch from '../ui/switch'

  export let activePage: PageV1
  export let selectedSlotId: string | null
  export let selectedContent: SlotContentV1 | null
  export let pageAspectLinked: boolean
  export let colorPresets: string[]
  export let recentColors: string[]
  export let cropModeSlotId: string | null
  export let cropZoom: number
  export let onresizepage: (axis: 'width' | 'height', value: number) => void
  export let onupdatestyle: (patch: Partial<PageV1['style']>) => void
  export let onpreviewstyle: (control: PageStyleControl, patch: Partial<PageV1['style']>) => void
  export let oncommitstyle: (control: PageStyleControl) => void
  export let onsetbackground: (color: string, rememberCustom?: boolean) => void
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
  export let onupdatecropposition: (axis: 'positionX' | 'positionY', percent: number) => void
  export let onfinishcrop: () => void
  export let onresetcrop: () => void
  export let onremoveimage: () => void
</script>

<aside class="sidebar right-panel" aria-label="Properties">
  <div class="panel-heading">
    <p class="eyebrow">
      Properties{selectedSlotId
        ? ` · Frame ${Object.keys(activePage.slots).indexOf(selectedSlotId) + 1}`
        : ''}
    </p>
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
                Crop mode is active. Drag the image, use the corner dots to zoom, or adjust values
                precisely. Escape cancels.
              </p>{:else}<button class="button" onclick={() => onbegincrop(selectedSlotId!)}
                >Crop image</button
              >
              <p class="crop-hint">
                Double-click the image, press Enter, or use Crop image to begin.
              </p>{/if}
            <div class="crop-zoom">
              <span>Zoom</span>
              <div class="inspector-slider">
                <Slider.Root
                  class="inspector-slider-root"
                  aria-label="Crop zoom"
                  type="single"
                  min={1}
                  max={8}
                  step={0.05}
                  value={cropZoom}
                  onValueChange={onupdatecropzoom}
                /><input
                  class="slider-value"
                  aria-label="Crop zoom value"
                  type="number"
                  min="1"
                  max="8"
                  step="0.05"
                  value={cropZoom.toFixed(2)}
                  onchange={(event) =>
                    onupdatecropzoom(Math.min(8, Math.max(1, Number(event.currentTarget.value))))}
                />
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
          ? 'Drag the photo to reposition it. Double-click it to crop.'
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
                min="64"
                value={activePage.width}
                onchange={(event) => onresizepage('width', Number(event.currentTarget.value))}
              />
            </label>
            <label>
              <span>Height</span><input
                aria-label="Page height"
                type="number"
                min="64"
                value={activePage.height}
                onchange={(event) => onresizepage('height', Number(event.currentTarget.value))}
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
          <div>
            <span>Background</span><Popover.Root
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
                      onchange={(event) => onsetbackground(event.currentTarget.value, true)}
                    /></label
                  >
                </div></Popover.Content
              ></Popover.Root
            >
          </div>
          <div>
            <span>Outer margin</span>
            <div class="inspector-slider">
              <Slider.Root
                class="inspector-slider-root"
                aria-label="Outer margin"
                type="single"
                min={0}
                max={120}
                step={1}
                value={activePage.style.padding}
                onValueChange={(padding) => onpreviewstyle('padding', { padding })}
                onValueCommit={() => oncommitstyle('padding')}
              /><input
                class="slider-value"
                aria-label="Outer margin value"
                type="number"
                min="0"
                max="120"
                value={activePage.style.padding}
                onchange={(event) =>
                  onupdatestyle({
                    padding: Math.min(120, Math.max(0, Number(event.currentTarget.value))),
                  })}
              />
            </div>
          </div>
          <div>
            <span>Inner spacing</span>
            <div class="inspector-slider">
              <Slider.Root
                class="inspector-slider-root"
                aria-label="Inner spacing"
                type="single"
                min={0}
                max={120}
                step={1}
                value={activePage.style.gap}
                onValueChange={(gap) => onpreviewstyle('gap', { gap })}
                onValueCommit={() => oncommitstyle('gap')}
              /><input
                class="slider-value"
                aria-label="Inner spacing value"
                type="number"
                min="0"
                max="120"
                value={activePage.style.gap}
                onchange={(event) =>
                  onupdatestyle({
                    gap: Math.min(120, Math.max(0, Number(event.currentTarget.value))),
                  })}
              />
            </div>
          </div>
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
                        onchange={(event) => onsetshadow(event.currentTarget.value, true)}
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
