import os
import magic
from flask import Flask, send_file, render_template, request, abort, url_for
from PIL import Image
import subprocess
from pathlib import Path
import random
from datetime import datetime
import sys
import fnmatch

# Try to import config file
try:
    from config import *
except ImportError:
    print("Warning: config.py not found. Existing...")
    sys.exit(1)


app = Flask(__name__, static_folder='static')

# Add datetime filter
@app.template_filter('datetime')
def format_datetime(timestamp):
    return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')

# Combine image and video extensions for easy checking
ALLOWED_EXTENSIONS_SET = set(ALLOWED_EXTENSIONS['images'] + ALLOWED_EXTENSIONS['videos'])

def get_cache_dir():
    """Get the cache directory from config or create a local .cache folder"""
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR, exist_ok=True)
    return CACHE_DIR

def get_cache_path(filepath):
    """Get the cache path that mirrors the source directory structure"""
    rel_path = os.path.relpath( filepath.lstrip('/'))
        
    # Create a cache path that mirrors the original directory structure
    cache_subpath = os.path.join(
        CACHE_DIR,
        os.path.dirname(rel_path)
    )
    
    # Ensure the cache subdirectory exists
    os.makedirs(cache_subpath, exist_ok=True)
    
    # Use the original filename with .jpg extension for the thumbnail
    cache_filename = f"{os.path.splitext(os.path.basename(filepath))[0]}.jpg"
    return os.path.join(cache_subpath, cache_filename)

CACHE_DIR = get_cache_dir()

def get_first_media_file(directory):
    """Get the first media file from a directory for folder thumbnail"""
    media_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if os.path.splitext(file)[1].lower() in ALLOWED_EXTENSIONS_SET:
                return os.path.join(root, file)

    return None

def should_ignore(path):
    """Check if a file or directory should be ignored based on config"""
    name = os.path.basename(path)
    if os.path.isfile(path):
        return any(fnmatch.fnmatch(name, pattern) for pattern in IGNORED_FILES)
    elif os.path.isdir(path):
        return name in IGNORED_DIRS
    return False

def get_file_type(filepath):
    """Determine if a file is an image or video using python-magic"""
    mime = magic.Magic(mime=True)
    file_type = mime.from_file(filepath)
    if file_type.startswith('image/'):
        return 'image'
    elif file_type.startswith('video/'):
        return 'video'
    return None

def generate_thumbnail(filepath, thumb_path):
    """Generate thumbnail for images and videos"""
    file_type = get_file_type(filepath)
    
    if file_type == 'image':
        with Image.open(filepath) as img:
            # Convert to RGB mode if necessary (especially for GIFs)
            if img.format == 'GIF':
                # Get the first frame for animated GIFs
                img.seek(0)
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img)
                img = rgb_img
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            img.thumbnail(THUMBNAIL_SIZE)
            img.save(thumb_path, 'JPEG', quality=THUMBNAIL_QUALITY)
    elif file_type == 'video':
        subprocess.run([
            'ffmpeg', '-i', filepath,
            '-ss', str(VIDEO_THUMBNAIL_POSITION),  # Use configured position
            '-vframes', '1',
            '-vf', f'scale={THUMBNAIL_SIZE[0]}:{THUMBNAIL_SIZE[1]}:force_original_aspect_ratio=decrease',
            thumb_path
        ], capture_output=True)

def get_file_info(filepath):
    """Get file information including size, dates, and type"""
    stat = os.stat(filepath)
    ext = os.path.splitext(filepath)[1].lower()
    return {
        'size': stat.st_size,
        'created': stat.st_ctime,
        'modified': stat.st_mtime,
        'is_video': ext in ALLOWED_EXTENSIONS['videos'],
        'is_image': ext in ALLOWED_EXTENSIONS['images'],
        'is_folder': os.path.isdir(filepath)
    }

@app.route('/')
def index():
    return gallery('')

@app.route('/gallery/')
@app.route('/gallery/<path:subpath>')
def gallery(subpath=''):
    # Get sort and pagination parameters
    sort_by = request.args.get('sort', DEFAULT_SORT)
    sort_order = request.args.get('order', DEFAULT_ORDER)
    page = max(1, int(request.args.get('page', 1)))
    per_page = request.args.get('per_page', '50')
    if per_page == 'all':
        per_page = sys.maxsize
    else:
        per_page = int(per_page)
    filter_text = request.args.get('filter', '').lower()

    items = []
    # Collect items from all root folders
    for root_path in GALLERY_ROOTS:
        current_path = os.path.join(root_path, subpath)
        
        # Skip if path doesn't exist in this root
        if not os.path.exists(current_path):
            continue
            
        # Security check to prevent directory traversal
        if not os.path.abspath(current_path).startswith(os.path.abspath(root_path)):
            continue

        for item in os.listdir(current_path):
            item_path = os.path.join(current_path, item)
            if should_ignore(item_path):
                continue
                
            rel_path = os.path.relpath(item_path, root_path)
            
            # Apply filter if provided
            if filter_text and filter_text not in item.lower():
                continue
            
            if os.path.isdir(item_path):
                # Check if directory contains any media files
                has_media = False
                for root, _, files in os.walk(item_path):
                    for file in files:
                        if os.path.splitext(file)[1].lower() in ALLOWED_EXTENSIONS_SET:
                            has_media = True
                            break
                    if has_media:
                        break
                
                # Skip empty folders
                if not has_media:
                    continue
                    
                # Try to find a random media file for folder thumbnail
                first_media_file = get_first_media_file(item_path)
                items.append({
                    'type': 'directory',
                    'name': item,
                    'path': rel_path,
                    'root_path': root_path,
                    'thumbnail': os.path.relpath(first_media_file, root_path) if first_media_file else None,
                    **get_file_info(item_path)
                })
            else:
                ext = os.path.splitext(item)[1].lower()
                if ext in ALLOWED_EXTENSIONS_SET:
                    file_info = get_file_info(item_path)
                    if file_info['size'] >= MIN_FILE_SIZE:  # Check minimum file size
                        items.append({
                            'type': 'file',
                            'name': item,
                            'path': rel_path,
                            'root_path': root_path,
                            **file_info
                        })

    # Sort items
    def sort_key(item):
        if sort_by == 'name':
            return (item['type'] != 'directory', item['name'].lower())
        elif sort_by == 'size':
            return (item['type'] != 'directory', item['size'])
        elif sort_by == 'created':
            return (item['type'] != 'directory', item['created'])
        elif sort_by == 'modified':
            return (item['type'] != 'directory', item['modified'])
        elif sort_by == 'type':
            return (item['type'] != 'directory', not item.get('is_video', False), item['name'].lower())
        elif sort_by == 'random':
            return random.random()  # Return random value for random sorting
        return item['name'].lower()

    items.sort(key=sort_key, reverse=(sort_order == 'desc' and sort_by != 'random'))
    
    # For random sort, shuffle the items after sorting
    if sort_by == 'random':
        random.shuffle(items)

    # Calculate pagination
    total_items = len(items)
    total_pages = max(1, (total_items + per_page - 1) // per_page)
    page = min(page, total_pages)
    
    # Store all file paths for continuous navigation
    all_files = [item for item in items if item['type'] == 'file']
    
    # Get items for current page
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    page_items = items[start_idx:end_idx]

    parent_path = os.path.dirname(subpath) if subpath else None
    filter_args = {
        'sort_by': sort_by,
        'sort_order': sort_order,
        'per_page': per_page,
        'filter': filter_text
    }
    
    return render_template(
        'gallery.html',
        items=page_items,
        all_files=all_files,
        current_path=subpath,
        parent_path=parent_path,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        total_pages=total_pages,
        per_page=per_page,
        total_items=total_items,
        filter_args=filter_args
    )

@app.route('/thumbnail/<path:filepath>')
def thumbnail(filepath):
    # Find the file in any of the root folders
    for root_path in GALLERY_ROOTS:
        full_path = os.path.join(root_path, filepath)
        if os.path.exists(full_path):
            # Security check
            if not os.path.abspath(full_path).startswith(os.path.abspath(root_path)):
                continue
                
            thumb_path = get_cache_path(full_path)
            
            # Generate thumbnail if it doesn't exist
            if not os.path.exists(thumb_path):
                generate_thumbnail(full_path, thumb_path)
            
            return send_file(thumb_path, mimetype='image/jpeg')
    
    abort(404)

def convert_to_browsable(filepath):
    original_filepath = filepath
    last_dot = original_filepath.rfind('.')
    
    if last_dot == -1:
        return None
    
    filepath_without_ext = original_filepath[:last_dot]
    cache_path = get_cache_path(filepath_without_ext + 'ORIGINAL.jpg')

    if not os.path.exists(cache_path):
        subprocess.run([
            'convert', original_filepath, cache_path
        ])

        return send_file(cache_path, mimetype='image/jpeg')

    return None
@app.route('/view/<path:filepath>')
def view_file(filepath):
    # Find the file in any of the root folders
    for root_path in GALLERY_ROOTS:
        full_path = os.path.join(root_path, filepath)
        if os.path.exists(full_path):
            # Security check
            if not os.path.abspath(full_path).startswith(os.path.abspath(root_path)):
                continue
                
            # Check file size limit for downloads
            if not ALLOW_DOWNLOAD:
                abort(403)
                
            file_size = os.path.getsize(full_path)
            if file_size > MAX_DOWNLOAD_SIZE:
                abort(413)  # Payload Too Large
                
            ext = os.path.splitext(full_path)[1].lower()

            if ext == '.nef':
                return convert_to_browsable(full_path)

            return send_file(full_path)
    
    abort(404)

def system_check():
    for root_path in GALLERY_ROOTS:
        if not os.path.exists(root_path):
            print(f"Error: Gallery root directory {root_path} does not exist.")
            sys.exit(1)
        if root_path.endswith('/'):
            print(f"Warning: Gallery root directory {root_path} ends with a slash.")
            sys.exit(1)

    if not os.path.exists(CACHE_DIR):
        print(f"Error: Cache directory {CACHE_DIR} does not exist.")
        sys.exit(1)

    if CACHE_DIR.endswith('/'):
        print(f"Warning: Cache directory {CACHE_DIR} ends with a slash.")
        sys.exit(1)

if __name__ == '__main__':
    system_check()

    app.run(debug=DEV_MODE, host=HOST, port=PORT) 