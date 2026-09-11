part of 'overlay.dart';

class _FloatingActions extends StatefulWidget {
  const _FloatingActions(
      {required this.position,
      required this.onMove,
      required this.expanded,
      required this.placing,
      required this.activate,
      required this.comment,
      required this.cancel,
      required this.canSee,
      required this.pinsVisible,
      required this.pinCount,
      required this.togglePins,
      required this.browse,
      required this.account,
      required this.viewer,
      required this.close});
  final Offset position;
  final ValueChanged<Offset> onMove;
  final bool expanded, placing, canSee, pinsVisible;
  final int pinCount;
  final VoidCallback? activate;
  final VoidCallback comment, cancel, togglePins, browse, account, close;
  final dynamic viewer;

  @override
  State<_FloatingActions> createState() => _FloatingActionsState();
}

class _FloatingActionsState extends State<_FloatingActions> {
  final barKey = GlobalKey();
  Offset? dragAnchor;
  @override
  Widget build(BuildContext context) => Padding(
        padding: MediaQuery.viewInsetsOf(context),
        child: SafeArea(
          minimum:
              EdgeInsets.all(MediaQuery.sizeOf(context).width <= 480 ? 12 : 20),
          child: LayoutBuilder(builder: (context, constraints) {
            final travel = Offset(math.max(0, constraints.maxWidth - 48),
                math.max(0, constraints.maxHeight - 48));
            final anchor = Offset(widget.position.dx * travel.dx + 48,
                widget.position.dy * travel.dy + 48);

            double labelWidth(String text) {
              final painter = TextPainter(
                  text: TextSpan(
                      text: text,
                      style: const TextStyle(
                          fontSize: 12.5, fontWeight: FontWeight.w500)),
                  textDirection: Directionality.of(context),
                  textScaler: MediaQuery.textScalerOf(context))
                ..layout();
              return painter.width + 54;
            }

            final rowWidth = 12 +
                labelWidth('Comment') +
                100 +
                12 +
                (widget.canSee
                    ? labelWidth('Pins ${widget.pinCount}') +
                        labelWidth('List') +
                        8
                    : 0);
            final stacked = rowWidth > constraints.maxWidth;
            final width = widget.placing
                ? math.min(310.0, constraints.maxWidth)
                : stacked
                    ? math.min(math.max(200.0, labelWidth('Comment') + 12),
                        constraints.maxWidth)
                    : rowWidth;
            final style = TextButton.styleFrom(
                foregroundColor: _muted,
                backgroundColor: Colors.transparent,
                minimumSize: const Size(0, 34),
                padding:
                    const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                shape: const StadiumBorder(),
                textStyle: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w500));
            final actions = <Widget>[
              OutlinedButton.icon(
                  onPressed: widget.comment,
                  style: style.copyWith(
                      foregroundColor:
                          const WidgetStatePropertyAll(Color(0xff14181f)),
                      side: const WidgetStatePropertyAll(
                          BorderSide(color: Color(0xffc9cfd8)))),
                  icon:
                      const _WebCommentIcon(size: 16, color: Color(0xff14181f)),
                  label: const Text('Comment')),
              if (widget.canSee) ...[
                TextButton.icon(
                    onPressed: widget.togglePins,
                    style: style,
                    icon: Icon(
                        widget.pinsVisible
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        size: 16),
                    label: Text('Pins ${widget.pinCount}')),
                TextButton.icon(
                    onPressed: widget.browse,
                    style: style,
                    icon: const Icon(Icons.format_list_bulleted, size: 16),
                    label: const Text('List')),
              ],
            ];
            final accountButton = IconButton(
                tooltip: widget.viewer == null ? 'Sign in' : 'Account',
                onPressed: widget.account,
                style: IconButton.styleFrom(shape: const CircleBorder()),
                icon: widget.viewer == null
                    ? const Icon(Icons.person_outline, size: 18)
                    : CircleAvatar(
                        radius: 14,
                        backgroundColor: _soft,
                        child: Text(_initials(widget.viewer['name']),
                            style: const TextStyle(fontSize: 11))));
            final closeButton = IconButton(
                tooltip: 'Close feedback toolbar',
                onPressed: widget.close,
                style: IconButton.styleFrom(shape: const CircleBorder()),
                icon: const Icon(Icons.close, size: 18));
            final contents = widget.placing
                ? Row(children: [
                    const Expanded(
                        child: Text('Tap anywhere to place a pin',
                            style: TextStyle(
                                fontSize: 13,
                                height: 1.45,
                                color: Color(0xff14181f),
                                decoration: TextDecoration.none))),
                    TextButton(
                        onPressed: widget.cancel,
                        style: style,
                        child: const Text('Cancel')),
                  ])
                : stacked
                    ? Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                            for (final action in actions)
                              Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: action),
                            Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [accountButton, closeButton]),
                          ])
                    : Row(mainAxisSize: MainAxisSize.min, children: [
                        for (final action in actions)
                          Padding(
                              padding: const EdgeInsets.only(right: 4),
                              child: action),
                        accountButton,
                        closeButton,
                      ]);
            return CustomSingleChildLayout(
              delegate: _ActionPosition(anchor),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onPanStart: (_) {
                  final box =
                      barKey.currentContext!.findRenderObject() as RenderBox;
                  // Normalize the clamped bar's anchor before dragging from an edge.
                  dragAnchor = Offset(
                      anchor.dx.clamp(box.size.width, constraints.maxWidth),
                      anchor.dy.clamp(box.size.height, constraints.maxHeight));
                },
                onPanUpdate: (details) {
                  final box =
                      barKey.currentContext!.findRenderObject() as RenderBox;
                  final next = (dragAnchor ?? anchor) + details.delta;
                  dragAnchor = Offset(
                      next.dx.clamp(box.size.width, constraints.maxWidth),
                      next.dy.clamp(box.size.height, constraints.maxHeight));
                  widget.onMove(Offset(
                      travel.dx == 0
                          ? 0
                          : ((dragAnchor!.dx - 48) / travel.dx).clamp(0, 1),
                      travel.dy == 0
                          ? 0
                          : ((dragAnchor!.dy - 48) / travel.dy).clamp(0, 1)));
                },
                child: Semantics(
                    hint: 'Drag to move',
                    child: AnimatedSize(
                      duration: MediaQuery.disableAnimationsOf(context)
                          ? Duration.zero
                          : const Duration(milliseconds: 150),
                      curve: Curves.easeOut,
                      alignment: Alignment.bottomRight,
                      child: SizedBox(
                          key: barKey,
                          child: widget.expanded || widget.placing
                              ? Container(
                                  key: const ValueKey('notette-action-bar'),
                                  width: width,
                                  padding: const EdgeInsets.all(6),
                                  decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(
                                          stacked || widget.placing ? 20 : 999),
                                      border: Border.all(color: _border),
                                      boxShadow: const [
                                        BoxShadow(
                                            color: Color(0x24101828),
                                            blurRadius: 24,
                                            offset: Offset(0, 6))
                                      ]),
                                  child: SingleChildScrollView(
                                      child: _Reveal(
                                          key: ValueKey(widget.placing),
                                          child: contents)),
                                )
                              : SizedBox(
                                  width: 48,
                                  height: 48,
                                  child: _LauncherButton(
                                      onPressed: widget.activate))),
                    )),
              ),
            );
          }),
        ),
      );
}

class _ActionPosition extends SingleChildLayoutDelegate {
  const _ActionPosition(this.anchor);
  final Offset anchor;
  @override
  BoxConstraints getConstraintsForChild(BoxConstraints constraints) =>
      constraints.loosen();
  @override
  Offset getPositionForChild(Size size, Size childSize) => Offset(
      (anchor.dx - childSize.width)
          .clamp(0, math.max(0, size.width - childSize.width)),
      (anchor.dy - childSize.height)
          .clamp(0, math.max(0, size.height - childSize.height)));
  @override
  bool shouldRelayout(_ActionPosition oldDelegate) =>
      oldDelegate.anchor != anchor;
}
