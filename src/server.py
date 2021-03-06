import os
import sys
import mimetypes
import weakref
import asyncio
import aiohttp

from aiohttp import web
from aiohttp.web import run_app

from .ptyctrl import PTY


routes = web.RouteTableDef()


async def init_app(app):
    # Init mimetypes
    mimetypes.init()

    # Set app working directory
    os.chdir('client/')

    # Default 404 error response
    app['404'] = {'body': None, 'ctype': None} 
    try:
        with open('404.html', 'r') as f:
            app['404']['body'] = f.read()
        app['404']['ctype'] = 'text/html'
    # Default 404 response if there was some error
    except (OSError, FileNotFoundError) as e:
        print(e)

    app['websockets'] = weakref.WeakSet()
    app['pty'] = weakref.WeakSet()

    app['shell-path'] = os.environ.get('SHELL', 'sh')

    try:
        app['loop'] = asyncio.get_running_loop()
    except RuntimeError as e:
        print(e)
        sys.exit('Failed to get event loop')


@routes.get('/')
async def root_handler(request):
    return web.HTTPFound('/index.html')


@routes.get("/ws")
async def ws_handle(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    try:
        pty = PTY(request.app['shell-path'])
    except Exception as e:
        print(e)
        raise web.HTTPInternalServerError

    request.app['websockets'].add(ws)
    request.app['pty'].add(pty)

    request.app['loop'].add_reader(pty.fd, pty_handle, 
                                   request.app['loop'], pty, ws)
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.text:
                #print('[WS-MSG-TEXT]', msg.data)
                pty.write(msg.data)
            elif msg.type == aiohttp.WSMsgType.binary:
                #print('[WS-MSG-BIN]', msg.data)
                row, col = msg.data.decode()[:-1].split(';')[-2:]
                pty.resize(int(row), int(col))
            elif msg.type == aiohttp.WSMsgType.close:
                request.app['loop'].remove_reader(pty.fd)

                pty.close()

                await ws.close()
    finally:
        request.app['websockets'].discard(ws)
        request.app['pty'].discard(pty)

    return ws


def pty_handle(loop, pty, ws):
    msg = pty.read()
    #print('[PTY-MSG]', msg)
    loop.create_task(ws.send_str(msg))


async def shutdown_app(app):
    for ws in set(app['websockets']):
        await ws.close(code=aiohttp.WSCloseCode.GOING_AWAY,
                       message='Server shutdown')

    for pty in set(app['pty']):
        pty.close()


# Create app instance
app = web.Application()

# Routes
routes.static('/', 'client/')
routes.static('/scripts', 'client/scripts')
app.add_routes(routes)

# Start/shutdown handling
app.on_startup.append(init_app)
app.on_shutdown.append(shutdown_app)

