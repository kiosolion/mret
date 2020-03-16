var escape_state = 0;
var escape_sequence = '';
var CSI_priv = '';
var OSC_msg = '';

function Screen() {
    this.style = new Style();
    this.curx = 0;
    this.cury = 0;
    this.saved_curx = 0;
    this.saved_cury = 0;
    this.cur_visible = 1;
};

screen = new Screen();
altscreen = new Screen();

var alternate_screen = '';
var terminal;
init();

function init() {
    screen.curx = 0;
    screen.cury = 0;

    terminal = document.getElementById('terminal');
    terminal.appendChild(document.createElement('div'));
    let charElem = document.createElement('span');
    charElem.appendChild(document.createTextNode('\xA0'));
    charElem.style.color = dcurcolor;
    charElem.style.backgroundColor = dcurbgcolor;
    terminal.lastElementChild.appendChild(charElem);
}

function changeCurPos(prevcurx, prevcury, newcurx, newcury) {
    if (terminal.childNodes.length > prevcury && 
        terminal.childNodes[prevcury]         &&
        terminal.childNodes[prevcury].childNodes.length > prevcurx) {
        
        prevcur = terminal.childNodes[prevcury].childNodes[prevcurx];
        prevcur.style.color = screen.style.curcolor;
        prevcur.style.backgroundColor = screen.style.curbrcolor;
    }

    while (terminal.childNodes.length <= newcury){
        terminal.appendChild(document.createElement('div'));
    }

    while (terminal.childNodes[newcury].childNodes.length <= newcurx){
        let charElem = document.createElement('span');
        charElem.appendChild(document.createTextNode('\xA0'));
        charElem.style.color = dcolor;
        charElem.style.backgroundColor = dbgcolor;
        
        terminal.childNodes[newcury].appendChild(charElem);
    }

    newcur = terminal.childNodes[newcury].childNodes[newcurx];
    screen.style.curcolor = newcur.style.color;
    screen.style.curbrcolor = newcur.style.backgroundColor;

    newcur.style.color = dcurcolor;
    newcur.style.backgroundColor = dcurbgcolor;
}

function handleCSI() {
    let buf = escape_sequence.split(';');
    let code = CSI_priv;

    for(let i = 0; i < buf.length; i ++) {
        if(buf[i]){
            buf[i] = Number(buf[i]);
        } else {
            buf[i] = 0;
        }
    }

    switch(code){
        case 'm':
            handleCGR(buf);
            break;
        case 'A': //Cursor Up
            if(buf[0] == 0)
                buf[0] = 1;
            changeCurPos(screen.curx, screen.cury, screen.curx, screen.cury - buf[0]);
            screen.cury -= buf[0];
            break;
        case 'B': //Cursor Down
            if(buf[0] == 0)
                buf[0] = 1;
            changeCurPos(screen.curx, screen.cury, screen.curx, screen.cury + buf[0]);
            screen.cury += buf[0];
            break;
        case 'C': //Cursor Right
            if(buf[0] == 0)
                buf[0] = 1;
            changeCurPos(screen.curx, screen.cury, screen.curx + buf[0], screen.cury);
            screen.curx += buf[0];
            break;
        case 'D': //Cursor Left
            if(buf[0] == 0)
                buf[0] = 1;
            changeCurPos(screen.curx, screen.cury, screen.curx - buf[0], screen.cury);
            screen.curx -= buf[0];
            break;
        case 'E': //Cursor Next Line
            if(buf[0] == 0)
                buf[0] = 1;
            changeCurPos(screen.curx, screen.cury, 0, screen.cury + buf[0]);
            screen.curx = 0;
            screen.cury += buf[0];
            break;
        case 'F': //Cursor Previous Line
            if(buf[0] == 0)
                buf[0] = 1;
            changeCurPos(screen.curx, screen.cury, 0, screen.cury - buf[0]);
            screen.curx = 0;
            screen.cury -= buf[0];
            break; 
        case 'G': //Cursor Horizontal Absolute
            buf[0] -= 1;
            changeCurPos(screen.curx, screen.cury, buf[0], screen.cury);
            screen.curx = buf[0];
            break; 
        case 'H': //Cursor Position
        case 'f':
            if(buf[0] > 0)
                buf[0] -= 1;
            if(buf.length == 1)
                buf.push(1);
            buf[1] -= 1;
            changeCurPos(screen.curx, screen.cury, buf[1], buf[0]);
            screen.curx = buf[1];
            screen.cury = buf[0];
            break; 
        case 'J': //Erase Data
            if(buf[0] == 0 || buf[0] == 2){
                let curdiv = terminal.childNodes[screen.cury];
                while(curdiv.childNodes[screen.curx] != curdiv.lastElementChild){
                    curdiv.removeChild(curdiv.childNodes[screen.curx]);
                }
                while(curdiv != terminal.lastElementChild){
                    terminal.removeChild(terminal.lastElementChild);
                }
            } 

            if(buf[0] == 1 || buf[0] == 2){
                for (let inode = 0; inode < terminal.childNodes[screen.cury].childNodes.length; inode++) {
                    terminal.childNodes[screen.cury].childNodes[inode].innerText = '\xA0';
                }
                for (let inode = 0; inode < terminal.childNodes.length; inode++) {
                    while (terminal.childNodes[inode].hasChildNodes()) {
                        terminal.childNodes[inode].removeChild(terminal.childNodes[inode].firstChild);
                    }
                    let charElem = document.createElement('span');
                    charElem.appendChild(document.createTextNode('\xA0'));
                    charElem.style.color = dcolor;
                    charElem.style.backgroundColor = dbgcolor;
                    terminal.childNodes[inode].append(charElem);
                    
                }
            }
            break;
        case 'K': //Erase in Line
            if(buf[0] == 0 || buf[0] == 2){
                let curdiv = terminal.childNodes[screen.cury];
                curdiv.childNodes[screen.curx].innerText = '\xA0';
                while(curdiv.childNodes[screen.curx] != curdiv.lastElementChild){
                    curdiv.removeChild(curdiv.lastElementChild);
                }
            }
            if(buf[0] == 1 || buf[0] == 2){
                let curdiv = terminal.childNodes[screen.cury];
                for(let inode = 0; inode <= screen.curx && inode < curdiv.childNodes.length; inode ++){
                    curdiv.childNodes[inode].innerText = '\xA0';
                }
            }
            break;
        case 'P':
            let curdiv = terminal.childNodes[screen.cury];
            changeCurPos(screen.curx, screen.cury, screen.curx + 1, screen.cury);
            curdiv.removeChild(curdiv.childNodes[screen.curx]);
            break;
        case 'S': //Scroll Up
            if(buf[0] == 0)
                buf[0] = 1;
            for(let i = 0; i < buf[0]; i ++){
                changeCurPos(screen.curx, screen.cury, screen.curx, screen.cury + 1);
                terminal.removeChild(terminal.firstElementChild);
            }
            break;
        case 'T': //Scroll Down
            if(buf[0] == 0)
                buf[0] = 1;
            for(let i = 0; i < buf[0]; i ++){
                terminal.insertBefore(document.createElement('div'), terminal.firstElementChild);
             
                let charElem = document.createElement('span');
                charElem.appendChild(document.createTextNode('\xA0'));
                charElem.style.color = dcolor;
                charElem.style.backgroundColor = dbgcolor;
                terminal.firstElementChild.append(charElem);
             
                changeCurPos(screen.curx, screen.cury + 1, screen.curx, screen.cury);
            }
            break;
        case 'n': //Device Status Report
            if(buf[0] == 6){
                ws.send('\x1B[' + (screen.cury + 1) + ';' + (screen.curx + 1)  + 'R');
                console.log('\x1B[' + (screen.cury + 1) + ';' + (screen.curx + 1)  + 'R');
            }
            break;
        case 's': //Save Cursor Position
            screen.saved_curx = screen.curx;
            screen.saved_cury = screen.cury;
            break;
        case 'u': //Restore Cursor Position
            changeCurPos(screen.curx, screen.cury, screen.saved_curx, screen.saved_cury);
            screen.curx = screen.saved_curx;
            screen.cury = screen.saved_cury;
            break;
        case '?h':
            if(buf[0] == 1049){
                [screen, altscreen] = [altscreen, screen];

                [terminal.innerHTML, alternate_screen] = [alternate_screen, terminal.innerHTML];
                changeCurPos(screen.curx, screen.cury, screen.curx, screen.cury);
            }
            break;
        case '?l':
            if(buf[0] == 1049 && screen.curx != -1){
                [screen, altscreen] = [altscreen, screen];

                [terminal.innerHTML, alternate_screen] = [alternate_screen, terminal.innerHTML];
            }
            break;
        default:
            break;
    }
}

function handleOSC(next_char) {
    if(escape_sequence.length > 2 && escape_sequence.slice(-1) == '\x07'){
        escape_state = 0;
    } else if(escape_sequence.length > 2 && escape_sequence.slice(-2) == '\x1b\\'){
        escape_state = 0;
    }

    if(escape_sequence.length == 3 && escape_sequence != ']0;'){
        escape_state = 0;
    }

    escape_sequence += next_char;
    //console.log(escape_sequence);

    if(escape_sequence.length > 2 && escape_sequence.slice(-1) == '\x07'){
        let title = escape_sequence.slice(3, -1);
        document.title = title;
    } else if(escape_sequence.length > 2 && escape_sequence.slice(-2) == '\x1b\\'){
        let title = escape_sequence.slice(3, -2);
        document.title = title;
    }
}

function parseCSI(next_char) {
    //TODO
    if(CSI_priv.length && CSI_priv.slice(-1) != '?'){
        console.log(CSI_priv + ' - ' + escape_sequence);
        escape_state = 0;
        return;
    }

    if(next_char == '?') {
        if (CSI_priv || escape_sequence.length)
            escape_state = 0;
        CSI_priv = '?';
    } else if('@ABCDEFGHIJKLMPSTXZ^`abcdefghilmnpqrstuvwxyz{|}~'.indexOf(next_char) != -1) {
        CSI_priv += next_char;
        handleCSI();
    } else if(escape_sequence.length == 0 && next_char != '[') {
        if (';0123456789'.indexOf(next_char) == -1){
            escape_state = 0;
        }
        escape_sequence += next_char;
    } else if(escape_sequence.length){
        if (';0123456789'.indexOf(next_char) == -1){
            escape_state = 0;
        }
        escape_sequence += next_char;
    }
}


function handleEscape(next_char){
    if(escape_state == 1){
        if('DEHMNOPVWXZ[]^_ #%()*+-./6789=>Fclmno|}~'.indexOf(next_char) == -1)
            escape_state = 0;
        else {
            escape_state = next_char;
            escape_sequence = '';
            CSI_priv = '';
        }
    }

    switch(escape_state){
        case '[':
            parseCSI(next_char);
            break;

        case ']':
            handleOSC(next_char);
            break;

        case ' ':
        case '#':
        case '%':
        case '(':
        case ')':
        case '*':
        case '+':
        case '-':
        case '.':
        case '/':
            // Skip symbol after sequence
            if(escape_sequence.length == 2){
                escape_state = 0;
            } else {
                escape_sequence += next_char;
            }
            break;

        default:
            escape_state = 0;
            break;
    }
}

function nextChar(next_char) {
    if(escape_state) {
        handleEscape(next_char);
        if(escape_state)
            return;
    }

    switch(next_char) {
        case '\x1b':
            escape_state = 1;
            break;

        case '\n':
            changeCurPos(screen.curx, screen.cury, screen.curx, screen.cury + 1);
            screen.cury += 1;
            break;

        case '\r': //CR
            changeCurPos(screen.curx, screen.cury, 0, screen.cury);
            screen.curx = 0;
            break;

        case '\x07': //BELL
            break;

        case '\x08': //Backspace
            if(screen.curx > 0){
                changeCurPos(screen.curx, screen.cury, screen.curx - 1, screen.cury);
                screen.curx --;
            }
            break;

        default:
            printChar(next_char);
            break;
    }

    window.scrollTo(0, 0);
}


function printChar(next_char){
    while (terminal.childNodes.length <= screen.cury){
        terminal.appendChild(document.createElement('div'));
    }
  
    while (terminal.childNodes[screen.cury].childNodes.length <= screen.curx){
        let charElem = document.createElement('span');
        charElem.appendChild(document.createTextNode('\xA0'));
        charElem.style.color = dcolor;
        charElem.style.backgroundColor = dbgcolor;
        
        terminal.childNodes[screen.cury].appendChild(charElem);
    }

    terminal.childNodes[screen.cury].childNodes[screen.curx].innerText = next_char;
    screen.style.curcolor = screen.style.color;
    screen.style.curbrcolor = screen.style.bgcolor;

    changeCurPos(screen.curx, screen.cury, screen.curx + 1, screen.cury);
    screen.curx ++;
}

(function() {
    window.addEventListener("resize", resizeThrottler, false);

    var resizeTimeout;
    function resizeThrottler() {
        if ( !resizeTimeout  ) {
            resizeTimeout = setTimeout(function() {
                resizeTimeout = null;
                actualResizeHandler();
            }, 500);
        }
    }

    function actualResizeHandler() {
        setNewSize();
    }
}());

function setNewSize(){
    let width  = document.body.clientWidth - terminal.offsetLeft;
    let height = document.body.clientHeight- terminal.offsetTop;

    let elementWidth  = terminal.firstElementChild.firstElementChild.offsetWidth;
    let elementHeight = terminal.firstElementChild.firstElementChild.offsetHeight;

    let charWidth  = Math.floor(width  / elementWidth );
    let charHeight = Math.floor(height / elementHeight);
    
    let encoder = new TextEncoder();

    let uint8Array = encoder.encode('\x1b[8;' + charHeight + ';' + charWidth + 't');
    ws.send(uint8Array);
}
