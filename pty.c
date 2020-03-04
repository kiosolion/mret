#include "include.h"

#include <signal.h>
#include <sys/ioctl.h>
#include <sys/poll.h>
#include <termios.h>
#include <pty.h>

typedef struct {
    int master;             // Master end. 
    int pid;                // Slave end.
    struct pollfd ufds[2];  // Two fds which events will be waited
    char buf[BUFSIZE];      // Saving input/output after read here
    struct termios ot, t;   // Struct with terminal attrs
    struct winsize ws;      // Sizes of window
    struct sigaction act;   // Action for signal
} PTY;

int new_pty(char * cmd, int connection_fd);
int shell_run(char * cmd);
int init_pty(PTY * pty, int connection_fd);
int pty_loop(PTY * pty, int connection_fd);

volatile int propagate_sigwinch = 0; // If 1, then call ioctl to change winsize

void 
sigwinch_handler(int signal) { // Handler for SIGWINCH
    propagate_sigwinch = 1;
}

int
new_pty(char * cmd, int connection_fd) {
    // Start new pty
    int pid;
    PTY * pty;
    
    // Malloc memory for struct pty and check for error
    if((pty = (PTY *) malloc(sizeof(PTY))) == NULL) {
        perror("Error in malloc for pty struct");
        return -1;
    }

    // Change window size and check for error
    if (ioctl(STDIN_FILENO, TIOCGWINSZ, &pty->ws) < 0) {
        perror("Error in ioctl for window size");
        return -1;
    }

    // Make two processes
    // One for accepting other connections (a.k.a p1)
    // Other for creating pty (a.k.a p2)
    if ((pid = fork()) < 0) {
        perror("Error in fork");
        return -1;
    }

    // p1 returns pid for pty process and waits for new connections
    if(pid) {
        return pid;
    }

    // p2 create pty process
    if ((pty->pid = forkpty(&pty->master, NULL, NULL, &pty->ws)) < 0) {
        perror("ptypair");
        exit(1);
    }

    // newly created pty execute commands in cmd
    if (pty->pid == 0) {
        shell_run(cmd);
        exit(0);
    }

    init_pty(pty, connection_fd);
    pty_loop(pty, connection_fd);

    close(connection_fd);
    free(pty);
    exit(0);
}

int 
shell_run(char * cmd) {
    //Start shell
    execl(cmd, cmd, 0);
    return 1;
}

int 
init_pty(PTY * pty, int connection_fd) {
    //Initialize pty
    pty->act.sa_handler = sigwinch_handler;
    sigemptyset(&(pty->act.sa_mask));
    pty->act.sa_flags = 0;
    if (sigaction(SIGWINCH, &pty->act, NULL) < 0) {
        perror("ptypair: невозможно обработать SIGWINCH");
        return 1;
    }

    tcgetattr(connection_fd, &pty->ot);
    pty->t = pty->ot;
    pty->t.c_lflag &= ~(ICANON | ISIG | ECHO | ECHOCTL | ECHOE |
                   ECHOK | ECHOKE | ECHONL | ECHOPRT);
    pty->t.c_iflag |= IGNBRK;
    pty->t.c_cc[VMIN] = 1;
    pty->t.c_cc[VTIME] = 0;
    tcsetattr(connection_fd, TCSANOW, &pty->t);

    pty->ufds[0].fd = connection_fd;
    pty->ufds[0].events = POLLIN;
    pty->ufds[1].fd = pty->master;
    pty->ufds[1].events = POLLIN;
    
    return 0;
}

int
pty_loop(PTY * pty, int connection_fd) {
    //Manage pty input/output
    int i;
    int done = 0;
    int r;

    do {
        r = poll(pty->ufds, 2, -1);

        if ((r < 0) && (errno != EINTR)) {
            done = 1;
            break;
        }

        if ((pty->ufds[0].revents | pty->ufds[1].revents) &
                (POLLERR | POLLHUP | POLLNVAL)) {
            done = 1;
            break;
        }

        if (propagate_sigwinch) {
            if (ioctl(STDIN_FILENO, TIOCGWINSZ, &pty->ws) < 0) {
                perror("ptypair: не удается получить размеры окна");
            }

            if (ioctl(pty->master, TIOCSWINSZ, &pty->ws) < 0) {
                perror("не удается восстановить размеры окна");
            }

            propagate_sigwinch = 0;
            continue;
        }

        if (pty->ufds[1].revents & POLLIN) {
             i = read (pty->master, pty->buf, BUFSIZE);
             if (i >= 1) {
                 //write(STDOUT_FILENO, pty->buf, i);
             } else {
                 done = 1;
             }
        }

        if (pty->ufds[0].revents & POLLIN) {
             i = read (connection_fd, pty->buf, BUFSIZE);
             if (i >= 1) {
                 printf("%s", pty->buf);
                 //write(pty->master, pty->buf, i);
             } else {
                  done = 1;
             }
        }
    } while (!done);

    tcsetattr(connection_fd, TCSANOW, &pty->ot);
    return 0;
}
