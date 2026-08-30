<?php

namespace App\Http\Controllers;

use App\Models\Trunk;
use Illuminate\Http\Request;

class TrunkController extends Controller
{
    public function index()
    {
        return view('admin.trunks.index', [
            'trunks' => Trunk::all()
        ]);
    }

    public function create()
    {
        return view('admin.trunks.create');
    }

    public function store(Request $request)
    {
        $request->validate([
            'name'   => 'required',
            'ip'     => 'nullable|ip',
            'prefix' => 'nullable',
            'status' => 'required'
        ]);

        Trunk::create($request->all());

        return redirect('/admin/trunks');
    }

    public function edit($id)
    {
        $trunk = Trunk::findOrFail($id);
        return view('admin.trunks.edit', compact('trunk'));
    }

    public function update(Request $request, $id)
    {
        $request->validate([
            'name'   => 'required',
            'ip'     => 'nullable|ip',
            'prefix' => 'nullable',
            'status' => 'required'
        ]);

        $trunk = Trunk::findOrFail($id);
        $trunk->update($request->all());

        return redirect('/admin/trunks');
    }

    public function destroy($id)
    {
        $trunk = Trunk::findOrFail($id);
        $trunk->delete();

        return redirect('/admin/trunks');
    }
}
