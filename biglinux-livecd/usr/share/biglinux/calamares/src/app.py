"""
Main GTK4 Application class for BigLinux Calamares Configuration Tool
"""

import logging

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")

from gi.repository import Adw, Gio, GLib, Gtk

from .infrastructure.accessibility import start_orca
from .infrastructure.i18n import _
from .profile import load_about
from .window import CalamaresWindow


def installed_version() -> str:
    """Version of the installed biglinux-livecd package (pacman -Q), or ""."""
    import subprocess

    try:
        out = subprocess.run(
            ["pacman", "-Q", "biglinux-livecd"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        ).stdout.split()
    except (OSError, subprocess.SubprocessError):
        return ""
    return out[1] if len(out) == 2 else ""


class CalamaresApp(Adw.Application):
    """Main application class following GNOME HIG guidelines"""

    def __init__(self):
        super().__init__(
            application_id="com.biglinux.calamares-config",
            flags=Gio.ApplicationFlags.DEFAULT_FLAGS,
        )

        # Set the desktop file and icon name for proper Wayland taskbar integration
        GLib.set_prgname("com.biglinux.calamares-config")
        GLib.set_application_name("BigLinux Installation")

        self.logger = logging.getLogger(__name__)
        self.window = None

        # Connect application signals
        self.connect("activate", self.on_activate)
        self.connect("shutdown", self.on_shutdown)

        # Setup application actions
        self.setup_actions()

        # Setup application menu and keyboard shortcuts
        self.setup_menu()

    def setup_actions(self):
        """Setup application-wide actions"""
        # Quit action
        quit_action = Gio.SimpleAction.new("quit", None)
        quit_action.connect("activate", self.on_quit_action)
        self.add_action(quit_action)

        # About action
        about_action = Gio.SimpleAction.new("about", None)
        about_action.connect("activate", self.on_about_action)
        self.add_action(about_action)

        # Preferences action (if needed in future)
        # Start ORCA screen reader (Super+Alt+S)
        orca_action = Gio.SimpleAction.new("start-orca", None)
        orca_action.connect("activate", self.on_start_orca_action)
        self.add_action(orca_action)

    def setup_menu(self):
        """Setup keyboard shortcuts"""
        # Quit shortcut
        self.set_accels_for_action("app.quit", ["<Control>q"])

        # About shortcut
        self.set_accels_for_action("app.about", ["F1"])

        # Super+Alt+S: start ORCA screen reader (standard GNOME shortcut)
        self.set_accels_for_action("app.start-orca", ["<Super><Alt>s"])

    def on_activate(self, app):
        """Called when application is activated"""
        self.logger.info("Application activated")

        # Create main window if it doesn't exist
        if not self.window:
            self.window = CalamaresWindow(application=self)

        # Present the window
        self.window.present()

    def on_shutdown(self, app):
        """Called when application is shutting down"""
        self.logger.info("Application shutting down")

        # Cleanup resources if needed
        if self.window:
            self.window.cleanup()

    def on_quit_action(self, _action, _param):
        """Handle quit action"""
        self.logger.info("Quit action triggered")
        self.quit()

    def on_about_action(self, _action, _param):
        """Show about dialog"""
        if not self.window:
            return

        # Adw.AboutWindow is deprecated since libadwaita 1.6; the dialog takes
        # its parent when presented rather than at construction. The edition's
        # profile (profile.json "about") may replace the BigLinux defaults.
        about = load_about()

        def text(key, default):
            value = about.get(key)
            return value if isinstance(value, str) and value else default

        def names(key, default):
            value = about.get(key)
            if isinstance(value, list) and all(isinstance(v, str) for v in value):
                return value
            return default

        about_dialog = Adw.AboutDialog(
            application_name=text("application_name", _("BigLinux Calamares Config")),
            application_icon=text("application_icon", "system-software-install"),
            version=installed_version() or "1.0.0",
            developer_name=text("developer_name", "BigLinux Team"),
            website=text("website", "https://www.biglinux.com.br"),
            support_url=text("support_url", "https://forum.biglinux.com.br"),
            issue_url=text(
                "issue_url", "https://github.com/biglinux/biglinux-calamares-config"
            ),
            license_type=Gtk.License.GPL_3_0,
            copyright=text("copyright", "© 2024 BigLinux Team"),
            developers=names("developers", ["BigLinux Development Team"]),
            designers=names("designers", ["BigLinux Design Team"]),
        )
        for section in about.get("credits", []):
            if isinstance(section, dict) and isinstance(section.get("title"), str):
                people = [p for p in section.get("people", []) if isinstance(p, str)]
                if people:
                    about_dialog.add_credit_section(section["title"], people)
        for section in about.get("acknowledgements", []):
            if isinstance(section, dict) and isinstance(section.get("title"), str):
                people = [p for p in section.get("people", []) if isinstance(p, str)]
                if people:
                    about_dialog.add_acknowledgement_section(section["title"], people)

        links = about.get("links")
        if not isinstance(links, list):
            links = [
                {"title": _("Forum"), "url": "https://forum.biglinux.com.br"},
                {
                    "title": _("Documentation"),
                    "url": "https://github.com/biglinux/biglinux-calamares-config/wiki",
                },
            ]
        for link in links:
            if (
                isinstance(link, dict)
                and isinstance(link.get("title"), str)
                and isinstance(link.get("url"), str)
            ):
                about_dialog.add_link(link["title"], link["url"])

        about_dialog.present(self.window)

    def on_start_orca_action(self, _action, _param):
        """Start ORCA screen reader via Super+Alt+S."""
        self.logger.info("Starting ORCA screen reader")
        start_orca()
